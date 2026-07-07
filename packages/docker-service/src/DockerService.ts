import { createHash } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  ServiceDefinition,
  type Host,
  type SecretReference,
  type ServiceDefinitionConfig,
} from "@saws/core";
import { runLocal } from "@saws/core/utils/run-local";

export type DockerHealthCheckConfig = {
  /** Command executed by Docker inside the container using CMD-SHELL. */
  command: string;
  /** Time between checks, expressed as a Docker duration such as "10s". */
  interval?: string;
  /** Maximum time one check may run, expressed as a Docker duration. */
  timeout?: string;
  /** Consecutive failures required before the container is unhealthy. */
  retries?: number;
  /** Startup grace period during which failures do not count. */
  startPeriod?: string;
};

export type RestartConfig = "always" | "unless-stopped" | "no";

type ImageConfig = {
  image: string;
};

type DockerFileConfig = {
  dockerfile: string;
  buildContext?: string;
};

type DefaultDockerFileConfig = {
  image?: never;
  dockerfile?: never;
  buildContext?: never;
};

export type DockerRegistryAuthConfig = {
  username: string;
  password: string | SecretReference;
};

export type DockerRunConfig = {
  name: string;
  image: string;
  network: string;
  env?: Record<string, string>;
  envFiles?: string[];
  volumes?: string[];
  ports?: string[];
  command?: string[];
  labels?: Record<string, string>;
  restart?: RestartConfig;
  healthCheck?: DockerHealthCheckConfig | false;
  pull?: boolean;
  configHash?: string;
};

type RuntimeFile = {
  localPath: string;
  remotePath: string;
};

export type DockerServiceConfig = (ImageConfig | DockerFileConfig | DefaultDockerFileConfig) & {
  host?: Host;
  appDirectory?: string;
  network?: string;
  registry?: string;
  auth?: DockerRegistryAuthConfig;
  environment?: Record<string, string>;
  volumes?: string[];
  ports?: string[];
  command?: string[];
  labels?: Record<string, string>;
  restart?: RestartConfig;
  healthCheck?: DockerHealthCheckConfig | false;
} & ServiceDefinitionConfig;

export class DockerService extends ServiceDefinition {
  readonly host?: Host;
  readonly appDirectory: string;
  readonly network: string;
  readonly registry?: string;
  readonly auth?: DockerRegistryAuthConfig;
  readonly image?: string;
  readonly dockerfile?: string;
  readonly buildContext?: string;
  readonly environment: Record<string, string>;
  readonly volumes: string[];
  readonly ports: string[];
  readonly command: string[];
  readonly labels: Record<string, string>;
  readonly restart?: RestartConfig;
  readonly healthCheck?: DockerHealthCheckConfig | false;
  protected readonly serviceType = "docker";
  protected devProcess?: ChildProcess;
  private devEnvironmentFile?: string;
  private localRegistryAuthenticated = false;
  private remoteRegistryAuthenticated = false;

  constructor(config: DockerServiceConfig) {
    super(config);
    const hasImage = "image" in config && config.image != null;
    const hasDockerfile = "dockerfile" in config && config.dockerfile != null;
    if (hasImage && hasDockerfile) {
      throw new Error(`Docker service "${config.name}" cannot configure both image and dockerfile`);
    }
    const buildsDockerfile = !hasImage;
    if (
      buildsDockerfile &&
      config.registry != null &&
      config.registry.replace(/\/+$/, "").length === 0
    ) {
      throw new Error(`Docker service "${config.name}" registry cannot be empty`);
    }
    if (buildsDockerfile && config.auth != null && config.auth.username.trim().length === 0) {
      throw new Error(`Docker service "${config.name}" registry auth username cannot be empty`);
    }

    this.host = config.host;
    this.appDirectory = config.appDirectory ?? "/opt/saws";
    this.network = config.network ?? "saws";
    this.registry = config.registry?.replace(/\/+$/, "");
    this.auth = config.auth;

    if (hasImage) {
      this.image = config.image;
    } else {
      this.dockerfile = hasDockerfile ? config.dockerfile : path.join(config.name, "Dockerfile");
      this.buildContext = hasDockerfile ? config.buildContext : config.name;
    }

    this.environment = config.environment ?? {};
    this.volumes = config.volumes ?? [];
    this.ports = config.ports ?? [];
    this.command = config.command ?? [];
    this.labels = config.labels ?? {};
    this.restart = config.restart;
    this.healthCheck = config.healthCheck;
  }

  override async dev() {
    await super.dev();

    const stage = "local";
    await this.buildDockerfileImage(stage, false);
    const config = await this.getDockerRunConfig(stage, false);

    try {
      this.devEnvironmentFile = await this.writeLocalEnvironmentFile(stage, config);
      this.devProcess = await this.startLocalContainer(config);
      this.observeDevProcess(this.devProcess);
    } catch (error) {
      await this.removeDevEnvironmentFile();
      throw error;
    }

    await this.onContainerStarted(stage);
  }

  override async deploy(stage: string) {
    await super.deploy(stage);
    await this.buildDockerfileImage(stage, true);
    await this.pushDockerfileImage(stage);
    const config = await this.getDockerRunConfig(stage, true);
    config.configHash = this.getContainerConfigHash(config);

    if (this.host == null) {
      await this.runLocalDetachedContainer(stage, config);
      await this.onContainerStarted(stage);
      return;
    }

    await this.assertRemoteHostReady();
    let environmentFile: RuntimeFile | undefined;

    try {
      environmentFile = await this.writeRemoteEnvironmentFile(stage, config);
      await this.runRemoteContainer(stage, config);
    } finally {
      if (environmentFile != null) {
        await this.removeRemoteRuntimeFile(environmentFile);
      }
    }

    await this.onContainerStarted(stage);
  }

  override exit() {
    super.exit();
    this.devProcess?.kill();
    this.devProcess = undefined;
    void this.removeDevEnvironmentFile();
  }

  protected getContainerName(stage: string) {
    return `${stage}-${this.name}`.replaceAll("_", "-").toLowerCase();
  }

  protected async getContainerEnvironment(stage: string): Promise<Record<string, string>> {
    return {
      ...(await this.getDependenciesEnvironmentVariables(stage)),
      ...this.environment,
    };
  }

  protected async getDockerRunConfig(stage: string, deploy: boolean): Promise<DockerRunConfig> {
    return {
      name: this.getContainerName(stage),
      image: this.getImage(stage, deploy),
      pull: this.dockerfile == null || deploy,
      network: this.getNetwork(stage),
      env: await this.getContainerEnvironment(stage),
      volumes: this.volumes,
      ports: this.ports,
      command: this.command,
      restart: this.restart,
      healthCheck: this.healthCheck,
      labels: {
        ...this.labels,
        "saws.service": this.name,
        "saws.serviceType": this.serviceType,
        "saws.stage": stage,
      },
    };
  }

  protected async onContainerStarted(_stage: string) {}

  protected getImage(stage: string, deploy: boolean) {
    if (this.image != null) return this.image;
    return this.getBuiltImageName(stage, deploy);
  }

  protected async buildDockerfileImage(stage: string, deploy: boolean) {
    if (this.dockerfile == null) return;

    await this.buildImage(this.getImage(stage, deploy));
  }

  protected async pushDockerfileImage(stage: string) {
    if (this.dockerfile == null || this.host == null) return;

    await this.pushImage(stage, this.getImage(stage, true));
  }

  private getNetwork(stage: string) {
    return `${this.network}-${stage}`;
  }

  private getAppDirectory(stage: string) {
    return path.posix.join(this.appDirectory, stage);
  }

  private getBuiltImageName(stage: string, deploy: boolean) {
    const repository = `${stage}-${this.name}`
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^[._-]+|[._-]+$/g, "");

    if (repository.length === 0) {
      throw new Error(`Cannot derive a Docker image name for service "${this.name}"`);
    }

    if (deploy && this.host != null) {
      if (this.registry == null) {
        throw new Error(
          `Docker service "${this.name}" uses a Dockerfile and remote deploy, but no registry is configured`,
        );
      }
      return `${this.registry}/${repository}:latest`;
    }

    return `saws-${repository}:latest`;
  }

  private async buildImage(image: string) {
    const dockerfile = path.resolve(this.dockerfile!);
    const buildContext = path.resolve(this.buildContext ?? path.dirname(this.dockerfile!));
    await runLocal(
      [
        "docker build",
        `-f ${shellQuote(dockerfile)}`,
        `-t ${shellQuote(image)}`,
        shellQuote(buildContext),
      ].join(" "),
    );
  }

  private async pushImage(stage: string, image: string) {
    await this.authenticateLocalRegistry(stage);
    await runLocal(`docker push ${shellQuote(image)}`);
  }

  private async authenticateLocalRegistry(stage: string) {
    if (this.registry == null || this.auth == null || this.localRegistryAuthenticated) return;
    await runLocal(
      [
        "docker login",
        shellQuote(this.getRegistryServer()),
        `--username ${shellQuote(this.auth.username)}`,
        "--password-stdin",
      ].join(" "),
      { input: `${await this.resolveRegistryPassword(stage)}\n` },
    );
    this.localRegistryAuthenticated = true;
  }

  private async authenticateRemoteRegistry(stage: string) {
    if (this.registry == null || this.auth == null || this.remoteRegistryAuthenticated) return;
    await this.host!.exec(
      [
        "docker login",
        shellQuote(this.getRegistryServer()),
        `--username ${shellQuote(this.auth.username)}`,
        "--password-stdin",
      ].join(" "),
      { input: `${await this.resolveRegistryPassword(stage)}\n` },
    );
    this.remoteRegistryAuthenticated = true;
  }

  private async resolveRegistryPassword(stage: string) {
    return typeof this.auth!.password === "string"
      ? this.auth!.password
      : this.auth!.password.resolve({ stage });
  }

  private getRegistryServer() {
    return this.registry!.split("/", 1)[0]!;
  }

  private async prepareLocalNetwork(network: string) {
    await runLocal(
      `docker network inspect ${shellQuote(network)} >/dev/null 2>&1 || docker network create ${shellQuote(network)}`,
    );
  }

  private async prepareRemote(stage: string, network: string) {
    await this.authenticateRemoteRegistry(stage);
    await this.host!.exec(`mkdir -p ${shellQuote(this.getAppDirectory(stage))}`);
    await this.host!.exec(
      `docker network inspect ${shellQuote(network)} >/dev/null 2>&1 || docker network create ${shellQuote(network)}`,
    );
  }

  private async assertRemoteHostReady() {
    await this.host!.assertReady();
  }

  private async runLocalDetachedContainer(stage: string, config: DockerRunConfig) {
    await this.prepareLocalNetwork(config.network);
    if (config.pull !== false) {
      await runLocal(`docker pull ${shellQuote(config.image)}`);
    }
    await this.withLocalEnvironmentFile(stage, config, async () => {
      await runLocal(`docker rm -f ${shellQuote(config.name)} >/dev/null 2>&1 || true`);
      await runLocal(
        this.getDockerRunCommand(
          {
            ...config,
            labels: {
              ...config.labels,
              "saws.configHash": config.configHash ?? this.getContainerConfigHash(config),
            },
          },
          true,
        ),
      );
    });
  }

  private async startLocalContainer(config: DockerRunConfig): Promise<ChildProcess> {
    await this.prepareLocalNetwork(config.network);

    if (config.pull !== false) {
      await runLocal(`docker pull ${shellQuote(config.image)}`);
    }
    await runLocal(`docker rm -f ${shellQuote(config.name)} >/dev/null 2>&1 || true`);

    const args = [
      "run",
      "--name",
      config.name,
      "--network",
      config.network,
      ...(config.env == null
        ? []
        : Object.entries(config.env).flatMap(([key, value]) => ["-e", `${key}=${value}`])),
      ...(config.envFiles ?? []).flatMap((envFile) => ["--env-file", envFile]),
      ...(config.volumes ?? []).flatMap((volume) => ["-v", volume]),
      ...(config.ports ?? []).flatMap((port) => ["-p", port]),
      ...Object.entries(config.labels ?? {}).flatMap(([key, value]) => [
        "--label",
        `${key}=${value}`,
      ]),
      ...this.getDockerHealthCheckArgs(config.healthCheck).flatMap((argument) =>
        argument.flagOnly ? [argument.flag] : [argument.flag, argument.value],
      ),
      config.image,
      ...(config.command ?? []),
    ];

    return spawn("docker", args, { stdio: ["ignore", "pipe", "pipe"] });
  }

  private async runRemoteContainer(stage: string, config: DockerRunConfig) {
    await this.prepareRemote(stage, config.network);

    if (config.pull !== false) {
      await this.host!.exec(`docker pull ${shellQuote(config.image)}`);
    }

    const configHash = config.configHash ?? this.getContainerConfigHash(config);
    const containerName = shellQuote(config.name);
    const image = shellQuote(config.image);
    const currentHash = `$(docker inspect --format ${shellQuote('{{index .Config.Labels "saws.configHash"}}')} ${containerName} 2>/dev/null || true)`;
    const currentImage = `$(docker inspect --format ${shellQuote("{{.Image}}")} ${containerName} 2>/dev/null || true)`;
    const desiredImage = `$(docker image inspect --format ${shellQuote("{{.Id}}")} ${image})`;
    const isRunning = `$(docker inspect --format ${shellQuote("{{.State.Running}}")} ${containerName} 2>/dev/null || true)`;

    await this.host!.exec(
      [
        `if [ "${currentHash}" = ${shellQuote(configHash)} ] && [ "${currentImage}" = "${desiredImage}" ]; then`,
        `if [ "${isRunning}" = "true" ]; then`,
        `echo ${shellQuote(`Container ${config.name} is unchanged`)}`,
        "else",
        `docker start ${containerName}`,
        "fi",
        "else",
        `docker rm -f ${containerName} >/dev/null 2>&1 || true`,
        this.getDockerRunCommand(
          {
            ...config,
            labels: {
              ...config.labels,
              "saws.configHash": configHash,
            },
          },
          true,
        ),
        "fi",
      ].join("\n"),
    );
  }

  private getDockerRunCommand(config: DockerRunConfig, detached: boolean) {
    const envArgs = Object.entries(config.env ?? {})
      .map(([key, value]) => `-e ${shellQuote(`${key}=${value}`)}`)
      .join(" ");
    const envFileArgs = (config.envFiles ?? [])
      .map((envFile) => `--env-file ${shellQuote(envFile)}`)
      .join(" ");
    const volumeArgs = (config.volumes ?? []).map((volume) => `-v ${shellQuote(volume)}`).join(" ");
    const portArgs = (config.ports ?? []).map((port) => `-p ${shellQuote(port)}`).join(" ");
    const labelArgs = Object.entries(config.labels ?? {})
      .map(([key, value]) => `--label ${shellQuote(`${key}=${value}`)}`)
      .join(" ");
    const healthCheckArgs = this.getDockerHealthCheckArgs(config.healthCheck)
      .map((argument) =>
        argument.flagOnly ? argument.flag : `${argument.flag} ${shellQuote(argument.value)}`,
      )
      .join(" ");
    const command = (config.command ?? []).map((part) => shellQuote(part)).join(" ");

    return [
      "docker run",
      detached ? "-d" : "",
      `--name ${shellQuote(config.name)}`,
      `--network ${shellQuote(config.network)}`,
      `--restart ${shellQuote(config.restart ?? "unless-stopped")}`,
      envArgs,
      envFileArgs,
      volumeArgs,
      portArgs,
      labelArgs,
      healthCheckArgs,
      shellQuote(config.image),
      command,
    ]
      .filter(Boolean)
      .join(" ");
  }

  private getDockerHealthCheckArgs(
    healthCheck: DockerRunConfig["healthCheck"],
  ): Array<{ flag: string; flagOnly: true } | { flag: string; flagOnly: false; value: string }> {
    if (healthCheck == null) return [];
    if (healthCheck === false) return [{ flag: "--no-healthcheck", flagOnly: true }];
    if (healthCheck.command.length === 0) {
      throw new Error("Docker health check command cannot be empty");
    }
    if (
      healthCheck.retries != null &&
      (!Number.isInteger(healthCheck.retries) || healthCheck.retries < 1)
    ) {
      throw new Error("Docker health check retries must be a positive integer");
    }

    const args: Array<
      { flag: string; flagOnly: true } | { flag: string; flagOnly: false; value: string }
    > = [{ flag: "--health-cmd", flagOnly: false, value: healthCheck.command }];

    for (const [flag, value] of [
      ["--health-interval", healthCheck.interval],
      ["--health-timeout", healthCheck.timeout],
      ["--health-start-period", healthCheck.startPeriod],
    ] as const) {
      if (value == null) continue;
      if (!isDockerDuration(value)) {
        throw new Error(`${flag.slice(2)} must be a positive Docker duration`);
      }
      args.push({ flag, flagOnly: false, value });
    }

    if (healthCheck.retries != null) {
      args.push({ flag: "--health-retries", flagOnly: false, value: String(healthCheck.retries) });
    }

    return args;
  }

  private getContainerConfigHash(config: DockerRunConfig) {
    const labels = { ...config.labels };
    delete labels["saws.configHash"];

    return createHash("sha256")
      .update(
        JSON.stringify({
          name: config.name,
          image: config.image,
          network: config.network,
          environment: sortRecord(config.env),
          envFiles: [...(config.envFiles ?? [])].sort(),
          volumes: [...(config.volumes ?? [])].sort(),
          ports: [...(config.ports ?? [])].sort(),
          command: config.command ?? [],
          labels: sortRecord(labels),
          restart: config.restart ?? "unless-stopped",
          healthCheck:
            config.healthCheck === false
              ? false
              : config.healthCheck == null
                ? null
                : {
                    command: config.healthCheck.command,
                    interval: config.healthCheck.interval,
                    timeout: config.healthCheck.timeout,
                    retries: config.healthCheck.retries,
                    startPeriod: config.healthCheck.startPeriod,
                  },
        }),
      )
      .digest("hex");
  }

  private async writeRemoteEnvironmentFile(stage: string, config: DockerRunConfig) {
    const contents = serializeEnvironment(config.env);
    if (contents == null) return undefined;

    const runtimeFile = await this.writeRemoteRuntimeFile(
      stage,
      `${this.name}/container.env`,
      contents,
    );
    config.env = undefined;
    config.envFiles = [...(config.envFiles ?? []), runtimeFile.remotePath];
    return runtimeFile;
  }

  private async writeLocalEnvironmentFile(stage: string, config: DockerRunConfig) {
    const contents = serializeEnvironment(config.env);
    if (contents == null) return undefined;

    const localPath = await this.writeLocalRuntimeFile(
      stage,
      `${this.name}/container.env`,
      contents,
    );
    config.env = undefined;
    config.envFiles = [...(config.envFiles ?? []), localPath];
    return localPath;
  }

  private async withLocalEnvironmentFile<T>(
    stage: string,
    config: DockerRunConfig,
    callback: () => Promise<T>,
  ) {
    const environmentFile = await this.writeLocalEnvironmentFile(stage, config);
    try {
      return await callback();
    } finally {
      if (environmentFile != null) {
        await rm(environmentFile, { force: true });
      }
    }
  }

  private async writeRemoteRuntimeFile(
    stage: string,
    relativePath: string,
    contents: string,
  ): Promise<RuntimeFile> {
    const localDir = path.resolve(".saws", "hosts", this.host!.name, stage);
    await mkdir(localDir, { recursive: true });

    const localPath = path.join(localDir, relativePath);
    await mkdir(path.dirname(localPath), { recursive: true });
    await writeFile(localPath, contents, { mode: 0o600 });

    const remotePath = path.posix.join(this.getAppDirectory(stage), relativePath);
    await this.host!.exec(`mkdir -p ${shellQuote(path.posix.dirname(remotePath))}`);
    await this.host!.copyFile(localPath, remotePath);
    return { localPath, remotePath };
  }

  private async removeRemoteRuntimeFile(runtimeFile: RuntimeFile) {
    await rm(runtimeFile.localPath, { force: true });
    await this.host!.exec(`rm -f ${shellQuote(runtimeFile.remotePath)}`);
  }

  private async writeLocalRuntimeFile(stage: string, relativePath: string, contents: string) {
    const localPath = path.resolve(".saws", "local", stage, relativePath);
    await mkdir(path.dirname(localPath), { recursive: true });
    await writeFile(localPath, contents, { mode: 0o600 });
    return localPath;
  }

  private observeDevProcess(process: ChildProcess) {
    process.once("error", (error) => {
      console.error(error.stack ?? error.message);
    });
    process.once("exit", (code, signal) => {
      if (this.devProcess === process) this.devProcess = undefined;
      if (code !== 0 && signal !== "SIGTERM" && signal !== "SIGINT") {
        console.error(
          `Docker container exited with code ${code ?? "unknown"}${signal == null ? "" : ` (${signal})`}`,
        );
      }
    });
  }

  override getStdOut() {
    return this.devProcess?.stdout;
  }

  override getStdErr() {
    return this.devProcess?.stderr;
  }

  private async removeDevEnvironmentFile() {
    if (this.devEnvironmentFile == null) return;
    const localPath = this.devEnvironmentFile;
    this.devEnvironmentFile = undefined;
    await rm(localPath, { force: true });
  }
}

function serializeEnvironment(environment?: Record<string, string>) {
  const entries = Object.entries(environment ?? {});
  if (entries.length === 0) return undefined;

  for (const [key, value] of entries) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      throw new Error(`Invalid Docker environment variable name: ${key}`);
    }
    if (value.includes("\n") || value.includes("\r")) {
      throw new Error(`Docker environment variable ${key} contains a newline`);
    }
  }

  return `${entries.map(([key, value]) => `${key}=${value}`).join("\n")}\n`;
}

function sortRecord<T>(record: Record<string, T> | undefined) {
  return Object.fromEntries(
    Object.entries(record ?? {}).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function isDockerDuration(value: string) {
  if (!/^(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h))+$/.test(value)) return false;
  return [...value.matchAll(/(\d+(?:\.\d+)?)(?:ns|us|µs|ms|s|m|h)/g)].some(
    (match) => Number(match[1]) > 0,
  );
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

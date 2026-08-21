import { createHash } from "node:crypto";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  ServiceDefinition,
  type Host,
  type SecretReference,
  type ServiceDefinitionConfig,
} from "@saws/core";
import { runLocal } from "@saws/core/utils/run-local";
import { shellQuote } from "@saws/core/utils/shell-quote";

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
  entrypoint?: string;
  command?: string[];
  labels?: Record<string, string>;
  restart?: RestartConfig;
  healthCheck?: DockerHealthCheckConfig | false;
  pull?: boolean;
  /** Content digests for runtime files. Values are safe to persist in the config hash. */
  runtimeFileDigests?: Record<string, string>;
  configHash?: string;
};

export type RuntimeFile = {
  localPath: string;
  remotePath: string;
};

/** A file whose contents affect the behavior of a container. */
export type ContainerRuntimeFile = {
  /** Stable identifier for the file, preferably its path inside the container. */
  path: string;
  /** Exact bytes that will be made available to the container. */
  contents: string | Uint8Array;
};

export type DockerServiceConfig = (ImageConfig | DockerFileConfig | DefaultDockerFileConfig) & {
  host: Host;
  appDirectory?: string;
  network?: string;
  registry?: string;
  auth?: DockerRegistryAuthConfig;
  volumes?: string[];
  ports?: string[];
  entrypoint?: string;
  command?: string[];
  labels?: Record<string, string>;
  restart?: RestartConfig;
  healthCheck?: DockerHealthCheckConfig | false;
} & ServiceDefinitionConfig;

export class DockerService extends ServiceDefinition {
  readonly host: Host;
  readonly appDirectory: string;
  readonly network: string;
  readonly registry?: string;
  readonly auth?: DockerRegistryAuthConfig;
  readonly image?: string;
  readonly dockerfile?: string;
  readonly buildContext?: string;
  readonly volumes: string[];
  readonly ports: string[];
  readonly entrypoint?: string;
  readonly command: string[];
  readonly labels: Record<string, string>;
  readonly restart?: RestartConfig;
  readonly healthCheck?: DockerHealthCheckConfig | false;
  protected readonly serviceType: string = "docker";
  protected devProcess?: ChildProcess;
  private devEnvironmentFile?: string;
  private readonly localRunAbortController = new AbortController();
  private readonly activeEphemeralContainers = new Set<string>();
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

    this.volumes = config.volumes ?? [];
    this.ports = config.ports ?? [];
    this.entrypoint = config.entrypoint;
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

  override async logs(stage: string) {
    if (stage === "local") return;

    const command = this.getDockerLogsCommand(stage);
    if (this.host == null) {
      await this.runLocalLogsCommand(command);
      return;
    }

    await this.host.exec(command);
  }

  override exit() {
    super.exit();
    this.localRunAbortController.abort();
    this.devProcess?.kill();
    this.devProcess = undefined;
    this.removeActiveEphemeralContainers();
    void this.removeDevEnvironmentFile();
  }

  protected getContainerName(stage: string) {
    return `${stage}-${this.name}`.replaceAll("_", "-").toLowerCase();
  }

  protected async getContainerEnvironment(stage: string): Promise<Record<string, string>> {
    return {
      ...(await this.getDependenciesEnvironmentVariables(stage)),
      ...(await this.getStageEnvironmentVariables(stage)),
      SAWS_SERVICE_NAME: this.name,
      SAWS_STAGE: stage,
      SAWS_GIT_SHA: this.getGitSha(),
    };
  }

  private getGitSha() {
    const result = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
    const gitSha = result.stdout.trim();

    if (result.status !== 0 || gitSha.length === 0) {
      const detail = result.error?.message ?? result.stderr.trim();
      throw new Error(
        `Unable to determine Git SHA for Docker service "${this.name}"${detail.length === 0 ? "" : `: ${detail}`}`,
      );
    }

    return gitSha;
  }

  protected async getDockerRunConfig(stage: string, deploy: boolean): Promise<DockerRunConfig> {
    const runtimeFileDigests = this.getContainerRuntimeFileDigests(
      await this.getContainerRuntimeFiles(stage, deploy),
    );

    return {
      name: this.getContainerName(stage),
      image: this.getImage(stage, deploy),
      pull: this.dockerfile == null || deploy,
      network: this.getNetwork(stage),
      env: await this.getContainerEnvironment(stage),
      volumes: this.volumes,
      ports: this.ports,
      entrypoint: this.entrypoint,
      command: this.command,
      restart: this.restart,
      healthCheck: this.healthCheck,
      runtimeFileDigests,
      labels: {
        ...this.labels,
        "saws.service": this.name,
        "saws.serviceType": this.serviceType,
        "saws.stage": stage,
      },
    };
  }

  protected async onContainerStarted(_stage: string) {}

  /**
   * Registers generated or copied files whose contents affect the running container.
   * Only SHA-256 digests of these contents participate in deployment change detection.
   * Subclasses must generate or copy the files before calling `super.deploy(stage)`.
   */
  protected async getContainerRuntimeFiles(
    _stage: string,
    _deploy: boolean,
  ): Promise<readonly ContainerRuntimeFile[]> {
    return [];
  }

  protected getImage(stage: string, deploy: boolean) {
    if (this.image != null) return this.image;
    return this.getBuiltImageName(stage, deploy);
  }

  protected async buildDockerfileImage(stage: string, deploy: boolean) {
    if (this.dockerfile == null) return;

    await this.buildImage(
      this.getImage(stage, deploy),
      deploy && this.host != null ? this.host.platform : undefined,
    );
  }

  protected async pushDockerfileImage(stage: string) {
    if (this.dockerfile == null || this.host == null) return;

    await this.pushImage(stage, this.getImage(stage, true));
  }

  protected getNetwork(stage: string) {
    return `${this.network}-${stage}`;
  }

  protected getAppDirectory(stage: string) {
    return path.posix.join(this.appDirectory, stage);
  }

  protected getBuiltImageName(stage: string, deploy: boolean) {
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

  private async buildImage(image: string, platform?: string) {
    const dockerfile = path.resolve(this.dockerfile!);
    const buildContext = path.resolve(this.buildContext ?? path.dirname(this.dockerfile!));
    await runLocal(
      [
        "docker build",
        ...(platform == null ? [] : [`--platform ${shellQuote(platform)}`]),
        `-f ${shellQuote(dockerfile)}`,
        `-t ${shellQuote(image)}`,
        shellQuote(buildContext),
      ].join(" "),
      this.getLocalRunOptions(),
    );
  }

  protected async pushImage(stage: string, image: string) {
    await this.authenticateLocalRegistry(stage);
    await runLocal(`docker push ${shellQuote(image)}`, this.getLocalRunOptions());
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
      this.getLocalRunOptions({ input: `${await this.resolveRegistryPassword(stage)}\n` }),
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

  private async prepareLocalNetwork(
    network: string,
    options: { dryRun?: boolean; serviceName?: string } = {},
  ) {
    await runLocal(
      `docker network inspect ${shellQuote(network)} >/dev/null 2>&1 || docker network create ${shellQuote(network)}`,
      this.getLocalRunOptions(options),
    );
  }

  protected async prepareRemote(stage: string, network: string, dryRun?: boolean) {
    if (!dryRun) {
      await this.authenticateRemoteRegistry(stage);
    }
    await this.host!.exec(`mkdir -p ${shellQuote(this.getAppDirectory(stage))}`, { dryRun });
    await this.host!.exec(
      `docker network inspect ${shellQuote(network)} >/dev/null 2>&1 || docker network create ${shellQuote(network)}`,
      { dryRun },
    );
  }

  protected async assertRemoteHostReady(dryRun?: boolean) {
    await this.host!.assertReady({ dryRun });
  }

  protected async runLocalDetachedContainer(stage: string, config: DockerRunConfig) {
    await this.prepareLocalNetwork(config.network);
    if (config.pull !== false) {
      await runLocal(`docker pull ${shellQuote(config.image)}`, this.getLocalRunOptions());
    }
    await this.withLocalEnvironmentFile(stage, config, async () => {
      await runLocal(
        `docker rm -f ${shellQuote(config.name)} >/dev/null 2>&1 || true`,
        this.getLocalRunOptions(),
      );
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
        this.getLocalRunOptions(),
      );
    });
  }

  protected async runEphemeralContainer(
    stage: string,
    config: DockerRunConfig,
    options: { dryRun?: boolean; logServiceName?: string } = {},
  ) {
    if (stage === "local" || this.host == null) {
      await this.prepareLocalNetwork(config.network, {
        dryRun: options.dryRun,
        serviceName: options.logServiceName,
      });
      if (config.pull !== false) {
        await runLocal(
          `docker pull ${shellQuote(config.image)}`,
          this.getLocalRunOptions({
            dryRun: options.dryRun,
            serviceName: options.logServiceName,
          }),
        );
      }
      await this.withLocalEnvironmentFile(stage, config, async () => {
        await runLocal(
          `docker rm -f ${shellQuote(config.name)} >/dev/null 2>&1 || true`,
          this.getLocalRunOptions({
            dryRun: options.dryRun,
            serviceName: options.logServiceName,
          }),
        );
        if (!options.dryRun) this.activeEphemeralContainers.add(config.name);
        try {
          await runLocal(
            this.getDockerRunCommand(config, false, { remove: true, includeRestart: false }),
            this.getLocalRunOptions({
              dryRun: options.dryRun,
              serviceName: options.logServiceName,
            }),
          );
        } finally {
          this.activeEphemeralContainers.delete(config.name);
        }
      });
      return;
    }

    await this.assertRemoteHostReady(options.dryRun);
    await this.prepareRemote(stage, config.network, options.dryRun);

    if (config.pull !== false) {
      await this.host.exec(`docker pull ${shellQuote(config.image)}`, { dryRun: options.dryRun });
    }

    let environmentFile: RuntimeFile | undefined;
    try {
      environmentFile = await this.writeRemoteEnvironmentFile(stage, config, options.dryRun);
      await this.host.exec(`docker rm -f ${shellQuote(config.name)} >/dev/null 2>&1 || true`, {
        dryRun: options.dryRun,
      });
      await this.host.exec(
        this.getDockerRunCommand(config, false, { remove: true, includeRestart: false }),
        { dryRun: options.dryRun },
      );
    } finally {
      if (environmentFile != null) {
        await this.removeRemoteRuntimeFile(environmentFile, options.dryRun);
      }
    }
  }

  private async startLocalContainer(config: DockerRunConfig): Promise<ChildProcess> {
    await this.prepareLocalNetwork(config.network);

    if (config.pull !== false) {
      await runLocal(`docker pull ${shellQuote(config.image)}`, this.getLocalRunOptions());
    }
    await runLocal(
      `docker rm -f ${shellQuote(config.name)} >/dev/null 2>&1 || true`,
      this.getLocalRunOptions(),
    );

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
      ...(config.entrypoint == null ? [] : ["--entrypoint", config.entrypoint]),
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

  private getLocalRunOptions(
    options: { dryRun?: boolean; input?: string; serviceName?: string } = {},
  ) {
    const { serviceName, ...runOptions } = options;
    return {
      ...runOptions,
      logSink: this.getRuntimeLogSink(),
      serviceName: serviceName ?? this.name,
      signal: this.localRunAbortController.signal,
    };
  }

  protected async runRemoteContainer(stage: string, config: DockerRunConfig) {
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

  protected getDockerRunCommand(
    config: DockerRunConfig,
    detached: boolean,
    options: { remove?: boolean; includeRestart?: boolean } = {},
  ) {
    const envArgs = Object.entries(config.env ?? {})
      .map(([key, value]) => `-e ${shellQuote(`${key}=${value}`)}`)
      .join(" ");
    const envFileArgs = (config.envFiles ?? [])
      .map((envFile) => `--env-file ${shellQuote(envFile)}`)
      .join(" ");
    const volumeArgs = (config.volumes ?? []).map((volume) => `-v ${shellQuote(volume)}`).join(" ");
    const portArgs = (config.ports ?? []).map((port) => `-p ${shellQuote(port)}`).join(" ");
    const entrypointArg =
      config.entrypoint == null ? "" : `--entrypoint ${shellQuote(config.entrypoint)}`;
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
      options.remove ? "--rm" : "",
      detached ? "-d" : "",
      `--name ${shellQuote(config.name)}`,
      `--network ${shellQuote(config.network)}`,
      options.includeRestart === false
        ? ""
        : `--restart ${shellQuote(config.restart ?? "unless-stopped")}`,
      envArgs,
      envFileArgs,
      volumeArgs,
      portArgs,
      entrypointArg,
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

  protected getContainerConfigHash(config: DockerRunConfig) {
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
          entrypoint: config.entrypoint,
          command: config.command ?? [],
          labels: sortRecord(labels),
          runtimeFileDigests:
            config.runtimeFileDigests == null ? undefined : sortRecord(config.runtimeFileDigests),
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

  private getContainerRuntimeFileDigests(files: readonly ContainerRuntimeFile[]) {
    if (files.length === 0) return undefined;

    const digests: Record<string, string> = {};
    for (const file of files) {
      if (file.path.length === 0) {
        throw new Error("Container runtime file path cannot be empty");
      }
      if (digests[file.path] != null) {
        throw new Error(`Container runtime file path "${file.path}" is registered more than once`);
      }
      digests[file.path] = createHash("sha256").update(file.contents).digest("hex");
    }
    return sortRecord(digests);
  }

  protected async writeRemoteEnvironmentFile(
    stage: string,
    config: DockerRunConfig,
    dryRun?: boolean,
  ) {
    const contents = serializeEnvironment(config.env);
    if (contents == null) return undefined;

    const runtimeFile = await this.writeRemoteRuntimeFile(
      stage,
      `${this.name}/container.env`,
      contents,
      dryRun,
    );
    config.env = undefined;
    config.envFiles = [...(config.envFiles ?? []), runtimeFile.remotePath];
    return runtimeFile;
  }

  protected async writeLocalEnvironmentFile(stage: string, config: DockerRunConfig) {
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

  protected async writeRemoteRuntimeFile(
    stage: string,
    relativePath: string,
    contents: string,
    options: boolean | { dryRun?: boolean; mode?: number } = {},
  ): Promise<RuntimeFile> {
    const dryRun = typeof options === "boolean" ? options : options.dryRun;
    const mode = typeof options === "boolean" ? 0o600 : (options.mode ?? 0o600);
    const localDir = path.resolve(".saws", "hosts", this.host!.name, stage);
    await mkdir(localDir, { recursive: true });

    const localPath = path.join(localDir, relativePath);
    await mkdir(path.dirname(localPath), { recursive: true });
    await writeFile(localPath, contents, { mode });

    const remotePath = path.posix.join(this.getAppDirectory(stage), relativePath);
    await this.host!.exec(`mkdir -p ${shellQuote(path.posix.dirname(remotePath))}`, { dryRun });
    await this.host!.copyFile(localPath, remotePath, { dryRun });
    await this.host!.exec(`chmod ${mode.toString(8)} ${shellQuote(remotePath)}`, { dryRun });
    return { localPath, remotePath };
  }

  protected async removeRemoteRuntimeFile(runtimeFile: RuntimeFile, dryRun?: boolean) {
    await rm(runtimeFile.localPath, { force: true });
    await this.host!.exec(`rm -f ${shellQuote(runtimeFile.remotePath)}`, { dryRun });
  }

  private async writeLocalRuntimeFile(stage: string, relativePath: string, contents: string) {
    const localPath = path.resolve(".saws", "local", stage, relativePath);
    await mkdir(path.dirname(localPath), { recursive: true });
    await writeFile(localPath, contents, { mode: 0o600 });
    return localPath;
  }

  private observeDevProcess(process: ChildProcess) {
    process.stdout?.on("data", (chunk: Buffer) => {
      this.writeRuntimeLog(chunk.toString("utf8"), "stdout");
    });
    process.stderr?.on("data", (chunk: Buffer) => {
      this.writeRuntimeLog(chunk.toString("utf8"), "stderr");
    });
    process.once("error", (error) => {
      this.writeRuntimeLog(`${error.stack ?? error.message}\n`, "stderr");
    });
    process.once("exit", (code, signal) => {
      if (this.devProcess === process) this.devProcess = undefined;
      if (code !== 0 && signal !== "SIGTERM" && signal !== "SIGINT") {
        this.writeRuntimeLog(
          `Docker container exited with code ${code ?? "unknown"}${signal == null ? "" : ` (${signal})`}\n`,
          "stderr",
        );
      }
    });
  }

  override getStdOut() {
    return null;
  }

  override getStdErr() {
    return null;
  }

  private async removeDevEnvironmentFile() {
    if (this.devEnvironmentFile == null) return;
    const localPath = this.devEnvironmentFile;
    this.devEnvironmentFile = undefined;
    await rm(localPath, { force: true });
  }

  private getDockerLogsCommand(stage: string) {
    return [
      `CONTAINERS=$(docker ps --filter label=saws.service=${shellQuote(this.name)} --filter label=saws.stage=${shellQuote(stage)} --format '{{.Names}}')`,
      'if [ -z "$CONTAINERS" ]; then',
      `echo ${shellQuote(`No running containers found for ${this.name} (${stage})`)} >&2`,
      "exit 1",
      "fi",
      "PIDS=",
      'cleanup() { for pid in $PIDS; do kill "$pid" >/dev/null 2>&1 || true; done; }',
      "trap cleanup INT TERM EXIT",
      "for container in $CONTAINERS; do",
      'docker logs --tail 100 -f "$container" &',
      'PIDS="$PIDS $!"',
      "done",
      "wait",
    ].join("\n");
  }

  private async runLocalLogsCommand(command: string) {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(command, {
        shell: true,
        stdio: "inherit",
      });

      child.on("error", reject);
      child.on("exit", (code) => {
        if (code === 0) {
          resolve();
          return;
        }

        reject(new Error(`docker logs exited with code ${code}`));
      });
    });
  }

  private removeActiveEphemeralContainers() {
    for (const container of this.activeEphemeralContainers) {
      spawnSync("docker", ["rm", "-f", container], { stdio: "ignore" });
    }
    this.activeEphemeralContainers.clear();
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

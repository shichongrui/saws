import type { ChildProcess } from "node:child_process";
import {
  DeployContext,
  type DevContext,
  type ExitContext,
  type RuntimeContext,
} from "@saws/core";
import {
  ServiceDefinition,
  type ServiceDefinitionConfig,
  type EnvironmentVariables,
} from "@saws/core";
import {
  type DockerHealthCheckConfig,
  type DockerProvider,
  type DockerRunConfig,
  type RuntimeFile,
} from "./docker-provider.js";

export interface DockerServiceConfig extends ServiceDefinitionConfig {
  docker: DockerProvider;
  /** Existing image to pull. Exactly one of image or dockerfile is required. */
  image?: string;
  /** Dockerfile path, relative to the runtime root directory unless absolute. */
  dockerfile?: string;
  /** Docker build context. Defaults to the Dockerfile's directory. */
  buildContext?: string;
  environment?: EnvironmentVariables;
  volumes?: string[];
  ports?: string[];
  command?: string[];
  labels?: Record<string, string>;
  restart?: DockerRunConfig["restart"];
  /** Native Docker health check. Set false to disable an image-defined check. */
  healthCheck?: DockerHealthCheckConfig | false;
}

/**
 * A service backed by a Docker image.
 *
 * Development runs the container on the local Docker daemon and attaches its
 * output to the SAWS log sink. Deployment replaces a detached container on the
 * DockerProvider's host.
 */
export class DockerService extends ServiceDefinition {
  readonly docker: DockerProvider;
  readonly image?: string;
  readonly dockerfile?: string;
  readonly buildContext?: string;
  readonly environment: EnvironmentVariables;
  readonly volumes: string[];
  readonly ports: string[];
  readonly command: string[];
  readonly labels: Record<string, string>;
  readonly restart?: DockerRunConfig["restart"];
  readonly healthCheck?: DockerHealthCheckConfig | false;
  protected devProcess?: ChildProcess;
  private devEnvironmentFile?: string;

  constructor(config: DockerServiceConfig) {
    super(config);
    if ((config.image == null) === (config.dockerfile == null)) {
      throw new Error(
        `Docker service "${config.name}" requires exactly one of image or dockerfile`
      );
    }
    this.docker = config.docker;
    this.image = config.image;
    this.dockerfile = config.dockerfile;
    this.buildContext = config.buildContext;
    this.environment = config.environment ?? {};
    this.volumes = config.volumes ?? [];
    this.ports = config.ports ?? [];
    this.command = config.command ?? [];
    this.labels = config.labels ?? {};
    this.restart = config.restart;
    this.healthCheck = config.healthCheck;
  }

  protected get serviceType() {
    return "docker";
  }

  protected getContainerName(context: RuntimeContext) {
    return `${context.stage}-${this.name}`.replaceAll("_", "-").toLowerCase();
  }

  protected async getContainerEnvironment(
    context: RuntimeContext
  ): Promise<EnvironmentVariables> {
    return {
      ...await this.getDependenciesEnvironmentVariables(context, "container"),
      ...this.environment,
    };
  }

  protected async getDockerRunConfig(
    context: RuntimeContext
  ): Promise<DockerRunConfig> {
    return {
      name: this.getContainerName(context),
      image: this.getImage(context),
      pull: this.dockerfile == null || context instanceof DeployContext,
      network: this.docker.getNetwork(context),
      env: await this.getContainerEnvironment(context),
      volumes: this.volumes,
      ports: this.ports,
      command: this.command,
      restart: this.restart,
      healthCheck: this.healthCheck,
      labels: {
        ...this.labels,
        "saws.service": this.name,
        "saws.serviceType": this.serviceType,
        "saws.stage": context.stage,
      },
    };
  }

  protected override async onDeploy(context: DeployContext) {
    await this.docker.assertHostReady(context);
    await this.prepareImage(context);
    const config = await this.getDockerRunConfig(context);
    config.configHash = this.docker.getContainerConfigHash(config);
    let environmentFile: RuntimeFile | undefined;

    try {
      environmentFile = await this.writeDeployEnvironmentFile(context, config);
      await this.docker.runContainer(context, config);
    } finally {
      if (environmentFile != null) {
        await this.docker.removeRuntimeFile(context, environmentFile);
      }
    }

    await this.onContainerStarted(context);
  }

  protected override async onDev(context: DevContext) {
    await this.prepareImage(context);
    const config = await this.getDockerRunConfig(context);
    try {
      this.devEnvironmentFile = await this.writeDevEnvironmentFile(context, config);
      this.devProcess = await this.docker.startLocalContainer(context, config);
      this.observeDevProcess(context, this.devProcess);
    } catch (error) {
      await this.removeDevEnvironmentFile();
      throw error;
    }

    await this.onContainerStarted(context);
  }

  protected override async onExit(_context: ExitContext) {
    this.devProcess?.kill();
    this.devProcess = undefined;
    await this.removeDevEnvironmentFile();
  }

  protected async onContainerStarted(_context: RuntimeContext) {}

  protected getImage(context: RuntimeContext) {
    return this.image ?? this.docker.getBuiltImageName(context, this.name);
  }

  protected async prepareImage(context: DeployContext | DevContext) {
    if (this.dockerfile == null) return;

    const image = this.getImage(context);
    await this.docker.buildImage(context, {
      dockerfile: this.dockerfile,
      context: this.buildContext,
      image,
    });

    if (context instanceof DeployContext) {
      await this.docker.pushImage(context, image);
    }
  }

  protected async writeDeployEnvironmentFile(
    context: DeployContext,
    config: DockerRunConfig
  ) {
    const contents = serializeEnvironment(config.env);
    if (contents == null) return undefined;

    const runtimeFile = await this.docker.writeRuntimeFile(
      context,
      `${this.name}/container.env`,
      contents
    );
    config.env = undefined;
    config.envFiles = [...(config.envFiles ?? []), runtimeFile.remotePath];
    return runtimeFile;
  }

  private async writeDevEnvironmentFile(
    context: DevContext,
    config: DockerRunConfig
  ) {
    const contents = serializeEnvironment(config.env);
    if (contents == null) return undefined;

    const localPath = await this.docker.writeLocalRuntimeFile(
      context,
      `${this.name}/container.env`,
      contents
    );
    config.env = undefined;
    config.envFiles = [...(config.envFiles ?? []), localPath];
    return localPath;
  }

  private observeDevProcess(context: DevContext, process: ChildProcess) {
    process.once("error", (error) => {
      context.writeLog(`${error.stack ?? error.message}\n`, "stderr");
    });
    process.once("exit", (code, signal) => {
      if (this.devProcess === process) this.devProcess = undefined;
      if (code !== 0 && signal !== "SIGTERM" && signal !== "SIGINT") {
        context.writeLog(
          `Docker container exited with code ${code ?? "unknown"}${signal == null ? "" : ` (${signal})`}\n`,
          "stderr"
        );
      }
    });
  }

  private async removeDevEnvironmentFile() {
    if (this.devEnvironmentFile == null) return;
    const localPath = this.devEnvironmentFile;
    this.devEnvironmentFile = undefined;
    await this.docker.removeLocalRuntimeFile(localPath);
  }
}

function serializeEnvironment(environment?: EnvironmentVariables) {
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

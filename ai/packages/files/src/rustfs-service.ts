import { randomBytes } from "node:crypto";
import {
  DeployContext,
  DevContext,
  type RuntimeContext,
} from "@saws/core";
import type {
  EnvironmentVariables,
  EnvironmentVariableTarget,
  ServiceOutputs,
} from "@saws/core";
import {
  DockerService,
  type DockerServiceConfig,
} from "@saws/docker";
import { SecretsManager } from "@saws/secrets";
import { rustFSServiceEnvironmentPrefix } from "./files.js";

export interface RustFSServiceConfig
  extends Omit<
    DockerServiceConfig,
    "image" | "dockerfile" | "buildContext" | "ports" | "volumes" | "command"
  > {
  image?: string;
  /** Host port for the S3 API. Defaults to 9000. */
  port?: number;
  /** Host port for the RustFS console. Defaults to 9001. */
  consolePort?: number;
  accessKeyId?: string;
  secretAccessKey?: string;
  region?: string;
  bucket?: string;
  volume?: string;
  dataDirectory?: string;
}

interface RustFSConnectionInfo {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  bucket: string;
}

/**
 * A persistent single-node RustFS server with dependency environment injection.
 */
export class RustFSService extends DockerService {
  readonly port: number;
  readonly consolePort: number;
  readonly accessKeyId: string;
  readonly secretAccessKey?: string;
  readonly region: string;
  readonly bucket?: string;
  readonly volume?: string;
  readonly dataDirectory: string;

  constructor(config: RustFSServiceConfig) {
    const port = config.port ?? 9000;
    const consolePort = config.consolePort ?? 9001;

    super({
      ...config,
      image: config.image ?? "rustfs/rustfs:latest",
      ports: [`${port}:9000`, `${consolePort}:9001`],
      command: [config.dataDirectory ?? "/data"],
    });
    this.port = port;
    this.consolePort = consolePort;
    this.accessKeyId = config.accessKeyId ?? "rustfsadmin";
    this.secretAccessKey = config.secretAccessKey;
    this.region = config.region ?? "us-east-1";
    this.bucket = config.bucket;
    this.volume = config.volume;
    this.dataDirectory = config.dataDirectory ?? "/data";
  }

  protected override get serviceType() {
    return "rustfs";
  }

  protected override async getContainerEnvironment(context: RuntimeContext) {
    const connection = await this.getConnectionInfo(context, "container");
    return {
      ...await super.getContainerEnvironment(context),
      RUSTFS_ACCESS_KEY: connection.accessKeyId,
      RUSTFS_SECRET_KEY: connection.secretAccessKey,
      RUSTFS_CONSOLE_ENABLE: "true",
    };
  }

  protected override async getDockerRunConfig(context: RuntimeContext) {
    const config = await super.getDockerRunConfig(context);
    return {
      ...config,
      volumes: [`${this.getVolumeName(context)}:${this.dataDirectory}`],
    };
  }

  protected override async onContainerStarted(context: RuntimeContext) {
    this.setOutputs(
      context.stage,
      this.toOutputs(await this.getConnectionInfo(context))
    );
  }

  override async getOutputs(context: RuntimeContext): Promise<ServiceOutputs> {
    const outputs = this.toOutputs(await this.getConnectionInfo(context));
    this.setOutputs(context.stage, outputs);
    return outputs;
  }

  override async getEnvironmentVariables(
    context: RuntimeContext,
    target: EnvironmentVariableTarget = "host"
  ): Promise<EnvironmentVariables> {
    const connection = await this.getConnectionInfo(context, target);
    const prefix = rustFSServiceEnvironmentPrefix(this.name);

    return {
      [`${prefix}_RUSTFS_ENDPOINT`]: connection.endpoint,
      [`${prefix}_RUSTFS_ACCESS_KEY_ID`]: connection.accessKeyId,
      [`${prefix}_RUSTFS_SECRET_ACCESS_KEY`]: connection.secretAccessKey,
      [`${prefix}_RUSTFS_REGION`]: connection.region,
      [`${prefix}_RUSTFS_BUCKET`]: connection.bucket,
    };
  }

  private async getConnectionInfo(
    context: RuntimeContext,
    target: EnvironmentVariableTarget = "host"
  ): Promise<RustFSConnectionInfo> {
    return {
      endpoint: this.getEndpoint(context, target),
      accessKeyId: this.accessKeyId,
      secretAccessKey:
        this.secretAccessKey ?? await this.getOrCreateSecretAccessKey(context),
      region: this.region,
      bucket: this.bucket ?? this.defaultBucketName(context),
    };
  }

  private getEndpoint(
    context: RuntimeContext,
    target: EnvironmentVariableTarget
  ) {
    if (target === "container") {
      return `http://${this.getContainerName(context)}:9000`;
    }
    if (context instanceof DeployContext) {
      return httpUrl(this.docker.host.address, this.port);
    }
    return httpUrl(
      context instanceof DevContext || context.stage === "local"
        ? "127.0.0.1"
        : this.docker.host.address,
      this.port
    );
  }

  private toOutputs(connection: RustFSConnectionInfo): ServiceOutputs {
    return {
      endpoint: connection.endpoint,
      accessKeyId: connection.accessKeyId,
      secretAccessKey: connection.secretAccessKey,
      region: connection.region,
      bucket: connection.bucket,
    };
  }

  private getVolumeName(context: RuntimeContext) {
    return (
      this.volume ??
      `${context.stage}-${this.name}-rustfs-data`
        .replaceAll("_", "-")
        .toLowerCase()
    );
  }

  private defaultBucketName(context: RuntimeContext) {
    return `${context.stage}-${this.name}`
      .toLowerCase()
      .replace(/[^a-z0-9.-]/g, "-");
  }

  private async getOrCreateSecretAccessKey(context: RuntimeContext) {
    const manager = new SecretsManager({
      stage: context.stage,
      rootDir: context.rootDir,
    });
    const secretName = `${this.name}-rustfs-secret-access-key`;

    try {
      return await manager.get(secretName);
    } catch (error) {
      if ((error as Error).name !== "ParameterNotFound") throw error;
    }

    const value = randomBytes(32).toString("base64url");
    await manager.set(secretName, value);
    return value;
  }
}

function httpUrl(host: string, port: number) {
  const normalizedHost = host
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
  return `http://${normalizedHost}:${port}`;
}

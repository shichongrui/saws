import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { SecretsManager, type ServiceEnvironmentTarget } from "@saws/core";
import type { Outputs } from "@saws/core/utils/stage-outputs";
import {
  DockerService,
  type DockerRunConfig,
  type DockerServiceConfig,
} from "@saws/docker-service";

export type RustFsFileConnectionTarget = "container" | "host";

export type RustFsFileConnectionInfo = {
  endpoint: string;
  dashboardEndpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  bucket: string;
};

export interface RustFsFileServiceConfig extends Omit<
  DockerServiceConfig,
  "image" | "dockerfile" | "buildContext" | "volumes" | "ports" | "command"
> {
  image?: string;
  /** Host port to expose the S3-compatible API on. Defaults to 9000. */
  apiPort?: number;
  /** Host port to expose the RustFS dashboard on. Defaults to 9001. */
  dashboardPort?: number;
  accessKeyId?: string;
  /** Explicit RustFS secret access key. Omit to persist a generated key in SAWS secrets. */
  secretAccessKey?: string;
  region?: string;
  bucket?: string;
  /** Override the Docker volume name. By default SAWS derives a stable stage/service volume. */
  volume?: string;
  dataDirectory?: string;
}

export class RustFsFileService extends DockerService {
  readonly apiPort?: number;
  readonly dashboardPort?: number;
  readonly accessKeyId: string;
  readonly secretAccessKey?: string;
  readonly region: string;
  readonly bucket?: string;
  readonly volume?: string;
  readonly dataDirectory: string;
  protected override readonly serviceType = "rustfs-file";

  constructor(config: RustFsFileServiceConfig) {
    super({
      ...config,
      image: config.image ?? "rustfs/rustfs:latest",
      command: [config.dataDirectory ?? "/data"],
    });

    this.apiPort = config.apiPort;
    this.dashboardPort = config.dashboardPort;
    this.accessKeyId = config.accessKeyId ?? "rustfsadmin";
    this.secretAccessKey = config.secretAccessKey;
    this.region = config.region ?? "us-east-1";
    this.bucket = config.bucket;
    this.volume = config.volume;
    this.dataDirectory = config.dataDirectory ?? "/data";
  }

  override async getEnvironmentVariables(
    stage: string,
    target: ServiceEnvironmentTarget = "container",
  ): Promise<Record<string, string>> {
    const connection = await this.getConnectionInfo(stage, target);
    const prefix = this.environmentVariablePrefix;

    return {
      [`${prefix}_FILES_ENDPOINT`]: connection.endpoint,
      [`${prefix}_FILES_DASHBOARD_ENDPOINT`]: connection.dashboardEndpoint,
      [`${prefix}_FILES_ACCESS_KEY_ID`]: connection.accessKeyId,
      [`${prefix}_FILES_SECRET_ACCESS_KEY`]: connection.secretAccessKey,
      [`${prefix}_FILES_REGION`]: connection.region,
      [`${prefix}_FILES_BUCKET`]: connection.bucket,
    };
  }

  async getConnectionInfo(
    stage: string,
    target: RustFsFileConnectionTarget = "host",
  ): Promise<RustFsFileConnectionInfo> {
    const host = target === "container" ? this.getContainerName(stage) : this.getHost(stage);
    const apiPort = target === "container" ? 9000 : this.getApiHostPort();
    const dashboardPort = target === "container" ? 9001 : this.getDashboardHostPort();

    return {
      endpoint: this.toHttpUrl(host, apiPort),
      dashboardEndpoint: this.toHttpUrl(host, dashboardPort),
      accessKeyId: this.accessKeyId,
      secretAccessKey: this.secretAccessKey ?? (await this.getOrCreateSecretAccessKey(stage)),
      region: this.region,
      bucket: this.bucket ?? this.defaultBucketName(stage),
    };
  }

  protected override async getContainerEnvironment(stage: string): Promise<Record<string, string>> {
    const connection = await this.getConnectionInfo(stage, "container");

    return {
      ...(await super.getContainerEnvironment(stage)),
      RUSTFS_ACCESS_KEY: connection.accessKeyId,
      RUSTFS_SECRET_KEY: connection.secretAccessKey,
      RUSTFS_CONSOLE_ENABLE: "true",
    };
  }

  protected override async getDockerRunConfig(
    stage: string,
    deploy: boolean,
  ): Promise<DockerRunConfig> {
    const config = await super.getDockerRunConfig(stage, deploy);

    return {
      ...config,
      volumes: [`${this.getVolumeName(stage)}:${this.dataDirectory}`],
      ports: [`${this.getApiHostPort()}:9000`, `${this.getDashboardHostPort()}:9001`],
    };
  }

  protected override async onContainerStarted(stage: string) {
    await this.setOutputs(this.toOutputs(await this.getConnectionInfo(stage, "host")), stage);
  }

  private get environmentVariablePrefix() {
    return this.name.replace(/[^a-zA-Z\d]/g, "_").toUpperCase();
  }

  private getHost(stage: string) {
    if (stage === "local") return "localhost";
    return this.host?.address ?? this.getContainerName(stage);
  }

  private getApiHostPort() {
    return this.apiPort ?? 9000;
  }

  private getDashboardHostPort() {
    return this.dashboardPort ?? 9001;
  }

  private getVolumeName(stage: string) {
    return this.volume ?? `${stage}-${this.name}-rustfs-data`.replaceAll("_", "-").toLowerCase();
  }

  private defaultBucketName(stage: string) {
    return `${stage}-${this.name}`.toLowerCase().replace(/[^a-z0-9.-]/g, "-");
  }

  private toOutputs(connection: RustFsFileConnectionInfo): Outputs {
    return {
      endpoint: connection.endpoint,
      dashboardEndpoint: connection.dashboardEndpoint,
      accessKeyId: connection.accessKeyId,
      secretAccessKey: connection.secretAccessKey,
      region: connection.region,
      bucket: connection.bucket,
    };
  }

  private toHttpUrl(host: string, port: number) {
    const normalizedHost = host.replace(/^https?:\/\//, "").replace(/\/+$/, "");
    return `http://${normalizedHost}:${port}`;
  }

  private async getOrCreateSecretAccessKey(stage: string) {
    const manager = new SecretsManager({ stage });
    const secretName = `${this.name}-rustfs-secret-access-key`;

    try {
      return await manager.get(secretName);
    } catch (error) {
      if ((error as Error).name !== "ParameterNotFound") throw error;
    }

    const legacySecretAccessKey = await this.getLegacySecretAccessKey(stage, secretName);
    if (legacySecretAccessKey != null) {
      await manager.set(secretName, legacySecretAccessKey);
      return legacySecretAccessKey;
    }

    const secretAccessKey = randomBytes(32).toString("base64url");
    await manager.set(secretName, secretAccessKey);
    return secretAccessKey;
  }

  private async getLegacySecretAccessKey(stage: string, secretName: string) {
    const secretPath = path.resolve(".saws", "secrets", stage, secretName);

    try {
      return (await readFile(secretPath, "utf8")).trim();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      return null;
    }
  }
}

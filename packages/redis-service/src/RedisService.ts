import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { SecretsManager } from "@saws/core";
import type { Outputs } from "@saws/core/utils/stage-outputs";
import { DockerService, type DockerServiceConfig } from "@saws/docker-service";

export type RedisConnectionTarget = "container" | "host";

export type RedisConnectionInfo = {
  host: string;
  port: string;
  password: string;
  url: string;
};

export interface RedisServiceConfig extends Omit<
  DockerServiceConfig,
  "image" | "dockerfile" | "buildContext" | "volumes" | "ports" | "command"
> {
  image?: string;
  /** Host port to expose Redis on. Local dev defaults to 6379; deploys stay private unless set. */
  port?: number;
  /** Explicit Redis password. Omit to persist a generated password in SAWS secrets. */
  password?: string;
  /** Override the Docker volume name. By default SAWS derives a stable stage/service volume. */
  volume?: string;
  dataDirectory?: string;
}

export class RedisService extends DockerService {
  readonly port?: number;
  readonly password?: string;
  readonly volume?: string;
  readonly dataDirectory: string;
  protected override readonly serviceType = "redis";

  constructor(config: RedisServiceConfig) {
    super({
      ...config,
      image: config.image ?? "redis:8",
      healthCheck: config.healthCheck ?? {
        command: 'redis-cli -a "$REDIS_PASSWORD" ping',
        interval: "10s",
        timeout: "5s",
        retries: 5,
        startPeriod: "10s",
      },
    });

    this.port = config.port;
    this.password = config.password;
    this.volume = config.volume;
    this.dataDirectory = config.dataDirectory ?? "/data";
  }

  override async getEnvironmentVariables(stage: string): Promise<Record<string, string>> {
    const connection = await this.getConnectionInfo(stage, "container");
    const prefix = this.environmentVariablePrefix;

    return {
      [`${prefix}_REDIS_HOST`]: connection.host,
      [`${prefix}_REDIS_PORT`]: connection.port,
      [`${prefix}_REDIS_PASSWORD`]: connection.password,
      [`${prefix}_REDIS_URL`]: connection.url,
    };
  }

  async getConnectionInfo(
    stage: string,
    target: RedisConnectionTarget = "host",
  ): Promise<RedisConnectionInfo> {
    const password = this.password ?? (await this.getOrCreatePassword(stage));
    const host = target === "container" ? this.getContainerName(stage) : this.getHost(stage);
    const port = target === "container" ? "6379" : String(this.getHostPort(stage));

    return {
      host,
      port,
      password,
      url: this.toRedisUrl(host, port, password),
    };
  }

  protected override async getContainerEnvironment(stage: string): Promise<Record<string, string>> {
    return {
      ...(await super.getContainerEnvironment(stage)),
      REDIS_PASSWORD: this.password ?? (await this.getOrCreatePassword(stage)),
    };
  }

  protected override async getDockerRunConfig(stage: string, deploy: boolean) {
    const config = await super.getDockerRunConfig(stage, deploy);
    const password = this.password ?? (await this.getOrCreatePassword(stage));

    return {
      ...config,
      volumes: [`${this.getVolumeName(stage)}:${this.dataDirectory}`],
      ports: deploy && this.port == null ? [] : [`${this.getHostPort(stage)}:6379`],
      command: [
        "redis-server",
        "--requirepass",
        password,
        "--save",
        "60",
        "1",
        "--loglevel",
        "warning",
      ],
    };
  }

  protected override async onContainerStarted(stage: string) {
    await this.setOutputs(this.toOutputs(await this.getConnectionInfo(stage, "host")), stage);
  }

  private get environmentVariablePrefix() {
    return this.name.replace(/[^a-zA-Z\d]/g, "_").toUpperCase();
  }

  private getHost(stage: string) {
    return stage === "local" ? "localhost" : this.getContainerName(stage);
  }

  private getHostPort(stage: string) {
    if (this.port != null) return this.port;
    return stage === "local" ? 6379 : 6379;
  }

  private getVolumeName(stage: string) {
    return this.volume ?? `${stage}-${this.name}-redis-data`.replaceAll("_", "-").toLowerCase();
  }

  private toOutputs(connection: RedisConnectionInfo): Outputs {
    return {
      redisHost: connection.host,
      redisPort: connection.port,
      redisPassword: connection.password,
      redisUrl: connection.url,
    };
  }

  private toRedisUrl(host: string, port: string, password: string) {
    return `redis://:${encodeURIComponent(password)}@${host}:${port}`;
  }

  private async getOrCreatePassword(stage: string) {
    const manager = new SecretsManager({ stage });
    const secretName = `${this.name}-redis-password`;

    try {
      return await manager.get(secretName);
    } catch (error) {
      if ((error as Error).name !== "ParameterNotFound") throw error;
    }

    const legacyPassword = await this.getLegacyPassword(stage, secretName);
    if (legacyPassword != null) {
      await manager.set(secretName, legacyPassword);
      return legacyPassword;
    }

    const password = randomBytes(24).toString("base64url");
    await manager.set(secretName, password);
    return password;
  }

  private async getLegacyPassword(stage: string, secretName: string) {
    const secretPath = path.resolve(".saws", "secrets", stage, secretName);

    try {
      return (await readFile(secretPath, "utf8")).trim();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      return null;
    }
  }
}

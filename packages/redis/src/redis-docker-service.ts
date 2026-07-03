import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
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

export interface RedisDockerServiceConfig
  extends Omit<
    DockerServiceConfig,
    "image" | "dockerfile" | "buildContext" | "ports" | "volumes"
  > {
  image?: string;
  /** Host port to expose Redis on. Omit to keep it private to the Docker network. */
  port?: number;
  password?: string;
  /** Override the Docker volume name. By default SAWS derives a stable stage/service volume. */
  volume?: string;
  dataDirectory?: string;
}

export interface RedisConnectionInfo {
  host: string;
  port: string;
  password: string;
}

export class RedisDockerService extends DockerService {
  readonly port?: number;
  readonly password?: string;
  readonly volume?: string;
  readonly dataDirectory: string;

  constructor(config: RedisDockerServiceConfig) {
    super({
      ...config,
      image: config.image ?? "redis:7",
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

  get envPrefix() {
    return this.name.replaceAll("-", "_").toUpperCase();
  }

  protected override get serviceType() {
    return "redis-docker";
  }

  protected override async getContainerEnvironment(context: RuntimeContext) {
    const connection = await this.getConnectionInfo(context);
    return {
      ...await super.getContainerEnvironment(context),
      REDIS_PASSWORD: connection.password,
    };
  }

  protected override async getDockerRunConfig(context: RuntimeContext) {
    const config = await super.getDockerRunConfig(context);
    const connection = await this.getConnectionInfo(context);
    return {
      ...config,
      volumes: [`${this.getVolumeName(context)}:${this.dataDirectory}`],
      ports: context instanceof DevContext
        ? [`${this.port ?? 6379}:6379`]
        : this.port == null ? [] : [`${this.port}:6379`],
      command: [
        "redis-server",
        "--requirepass",
        connection.password,
        "--save",
        "60",
        "1",
        "--loglevel",
        "warning",
      ],
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
    const prefix = this.envPrefix;

    return {
      [`${prefix}_REDIS_HOST`]: connection.host,
      [`${prefix}_REDIS_PORT`]: connection.port,
      [`${prefix}_REDIS_PASSWORD`]: connection.password,
      [`${prefix}_REDIS_URL`]: this.toRedisUrl(connection),
    };
  }

  private async getConnectionInfo(
    context: RuntimeContext,
    target: EnvironmentVariableTarget = "host"
  ): Promise<RedisConnectionInfo> {
    const password = this.password ?? await this.getOrCreatePassword(context);
    const isContainerTarget = target === "container";

    return {
      host: isContainerTarget
        ? this.getContainerName(context)
        : isLocal(context)
        ? "localhost"
        : this.getContainerName(context),
      port: isContainerTarget
        ? "6379"
        : this.port != null
        ? String(this.port)
        : isLocal(context)
        ? "6379"
        : "6379",
      password,
    };
  }

  private toOutputs(connection: RedisConnectionInfo): ServiceOutputs {
    return {
      redisHost: connection.host,
      redisPort: connection.port,
      redisPassword: connection.password,
      redisUrl: this.toRedisUrl(connection),
    };
  }

  private toRedisUrl(connection: RedisConnectionInfo) {
    return `redis://:${encodeURIComponent(connection.password)}@${connection.host}:${connection.port}`;
  }

  private getVolumeName(context: RuntimeContext) {
    return (
      this.volume ??
      `${context.stage}-${this.name}-redis-data`
        .replaceAll("_", "-")
        .toLowerCase()
    );
  }

  private async getOrCreatePassword(context: RuntimeContext) {
    const manager = new SecretsManager({
      stage: context.stage,
      rootDir: context.rootDir,
    });
    const secretName = this.getPasswordSecretName();

    try {
      return await manager.get(secretName);
    } catch (error) {
      if ((error as Error).name !== "ParameterNotFound") throw error;
    }

    const legacyPassword = await this.getLegacyPassword(context);
    if (legacyPassword != null) {
      await manager.set(secretName, legacyPassword);
      return legacyPassword;
    }

    const password = randomBytes(24).toString("base64url");
    await manager.set(secretName, password);
    return password;
  }

  private getPasswordSecretName() {
    return `${this.name}-redis-password`;
  }

  private async getLegacyPassword(context: RuntimeContext) {
    const secretPath = path.resolve(
      context.rootDir,
      ".saws",
      "secrets",
      context.stage,
      this.getPasswordSecretName()
    );

    try {
      return (await readFile(secretPath, "utf8")).trim();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      return null;
    }
  }
}

function isLocal(context: RuntimeContext) {
  return context instanceof DevContext || context.stage === "local";
}

import { randomBytes } from "node:crypto";
import { access, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { SecretsManager, ServiceDefinition } from "@saws/core";
import { installDependencies } from "@saws/core/utils/dependency-management";
import type { Outputs } from "@saws/core/utils/stage-outputs";
import { DockerService, type DockerServiceConfig } from "@saws/docker-service";
import { createMigrateCommand } from "./migrate-command.js";

export type PostgresConnectionTarget = "container" | "host";

export type PostgresConnectionInfo = {
  host: string;
  port: string;
  username: string;
  password: string;
  database: string;
  url: string;
};

export interface PostgresServiceConfig
  extends Omit<
    DockerServiceConfig,
    "image" | "dockerfile" | "buildContext" | "volumes" | "ports" | "command"
  > {
  image?: string;
  /** Host port to expose Postgres on. Local dev defaults to 5432; deploys stay private unless set. */
  port?: number;
  /** Database created by the Postgres image and used in generated connection URLs. */
  database?: string;
  /** Postgres superuser created by the Postgres image. Defaults to "postgres". */
  username?: string;
  /** Explicit Postgres password. Omit to persist a generated password in SAWS secrets. */
  password?: string;
  /** Override the Docker volume name. By default SAWS derives a stable stage/service volume. */
  volume?: string;
  dataDirectory?: string;
}

export class PostgresService extends DockerService {
  static getCommands(services: ServiceDefinition[] = []) {
    return [createMigrateCommand(services.filter(isPostgresService))];
  }

  readonly port?: number;
  readonly database?: string;
  readonly username: string;
  readonly password?: string;
  readonly volume?: string;
  readonly dataDirectory: string;
  protected override readonly serviceType = "postgres";

  constructor(config: PostgresServiceConfig) {
    super({
      ...config,
      image: config.image ?? "postgres:18",
      healthCheck: config.healthCheck ?? {
        command: 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"',
        interval: "10s",
        timeout: "5s",
        retries: 5,
        startPeriod: "10s",
      },
    });

    this.port = config.port;
    this.database = config.database;
    this.username = config.username ?? "postgres";
    this.password = config.password;
    this.volume = config.volume;
    this.dataDirectory = config.dataDirectory ?? "/var/lib/postgresql/data";
  }

  override async init() {
    await super.init();
    await mkdir(path.resolve(this.name, "migrations"), { recursive: true });
    if (
      !(await hasDbmateDependency()) ||
      !(await fileExists(path.resolve("node_modules", ".bin", "dbmate")))
    ) {
      await installDependencies(["dbmate"], { development: true });
    }
  }

  override async getEnvironmentVariables(stage: string): Promise<Record<string, string>> {
    const connection = await this.getConnectionInfo(stage, "container");
    const prefix = this.environmentVariablePrefix;

    return {
      [`${prefix}_POSTGRES_HOST`]: connection.host,
      [`${prefix}_POSTGRES_PORT`]: connection.port,
      [`${prefix}_POSTGRES_USERNAME`]: connection.username,
      [`${prefix}_POSTGRES_PASSWORD`]: connection.password,
      [`${prefix}_POSTGRES_DB_NAME`]: connection.database,
      [`${prefix}_DATABASE_URL`]: connection.url,
    };
  }

  async getConnectionInfo(
    stage: string,
    target: PostgresConnectionTarget = "host",
  ): Promise<PostgresConnectionInfo> {
    const password = this.password ?? (await this.getOrCreatePassword(stage));
    const host = target === "container" ? this.getContainerName(stage) : this.getHost(stage);
    const port = target === "container" ? "5432" : String(this.getHostPort(stage));
    const database = this.database ?? this.defaultDatabaseName(stage);
    const connection = {
      host,
      port,
      username: this.username,
      password,
      database,
    };

    return {
      ...connection,
      url: this.toDatabaseUrl(connection),
    };
  }

  toDatabaseUrl(connection: Omit<PostgresConnectionInfo, "url">) {
    return `postgresql://${encodeURIComponent(connection.username)}:${encodeURIComponent(
      connection.password,
    )}@${connection.host}:${connection.port}/${connection.database}`;
  }

  protected override async getContainerEnvironment(stage: string): Promise<Record<string, string>> {
    const connection = await this.getConnectionInfo(stage, "container");

    return {
      ...(await super.getContainerEnvironment(stage)),
      POSTGRES_USER: connection.username,
      POSTGRES_PASSWORD: connection.password,
      POSTGRES_DB: connection.database,
    };
  }

  protected override async getDockerRunConfig(stage: string, deploy: boolean) {
    const config = await super.getDockerRunConfig(stage, deploy);

    return {
      ...config,
      volumes: [`${this.getVolumeName(stage)}:${this.dataDirectory}`],
      ports: deploy && this.port == null ? [] : [`${this.getHostPort(stage)}:5432`],
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

  private getHostPort(_stage: string) {
    return this.port ?? 5432;
  }

  private getVolumeName(stage: string) {
    return this.volume ?? `${stage}-${this.name}-postgres-data`.replaceAll("_", "-").toLowerCase();
  }

  private defaultDatabaseName(stage: string) {
    return `${stage}_${this.name}`.replaceAll("-", "_").toLowerCase();
  }

  private toOutputs(connection: PostgresConnectionInfo): Outputs {
    return {
      postgresHost: connection.host,
      postgresPort: connection.port,
      postgresUsername: connection.username,
      postgresPassword: connection.password,
      postgresDBName: connection.database,
      databaseUrl: connection.url,
    };
  }

  private async getOrCreatePassword(stage: string) {
    const manager = new SecretsManager({ stage });
    const secretName = `${this.name}-postgres-password`;

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

function isPostgresService(service: ServiceDefinition): service is PostgresService {
  return service instanceof PostgresService;
}

async function hasDbmateDependency() {
  try {
    const contents = await readFile(path.resolve("package.json"), "utf8");
    const packageJson = JSON.parse(contents) as {
      dependencies?: Record<string, unknown>;
      devDependencies?: Record<string, unknown>;
    };

    return packageJson.dependencies?.dbmate != null || packageJson.devDependencies?.dbmate != null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function fileExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

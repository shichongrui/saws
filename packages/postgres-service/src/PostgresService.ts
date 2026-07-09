import { randomBytes } from "node:crypto";
import { mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import {
  SecretsManager,
  ServiceDefinition,
  type SecretReference,
  type ServiceEnvironmentTarget,
} from "@saws/core";
import { hasDependency, installDependencies } from "@saws/core/utils/dependency-management";
import { fileExists } from "@saws/core/utils/file-exists";
import { listFiles } from "@saws/core/utils/list-files";
import { runLocal } from "@saws/core/utils/run-local";
import { shellQuote } from "@saws/core/utils/shell-quote";
import type { Outputs } from "@saws/core/utils/stage-outputs";
import {
  DockerService,
  type DockerRunConfig,
  type DockerServiceConfig,
  type RuntimeFile,
} from "@saws/docker-service";
import { createMigrateCommand } from "./migrate-command.js";

const POSTGRES_VOLUME_DIRECTORY = "/var/lib/postgresql";

export type PostgresConnectionTarget = "container" | "host";

export type PostgresConnectionInfo = {
  host: string;
  port: string;
  username: string;
  password: string;
  database: string;
  url: string;
};

export interface PostgresServiceConfig extends Omit<
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
  /** Postgres password secret reference. Omit to store a generated password in SAWS secrets. */
  password?: SecretReference;
  /** Override the Docker volume name. By default SAWS derives a stable stage/service volume. */
  volume?: string;
  /** Enable logical WAL for replication/change data capture use cases. */
  wal_enabled?: boolean;
  /** dbmate image used to apply migrations in an ephemeral sibling container. */
  migrationImage?: string;
}

export class PostgresService extends DockerService {
  static getCommands(services: ServiceDefinition[] = []) {
    return [createMigrateCommand(services.filter(isPostgresService))];
  }

  readonly port?: number;
  readonly database?: string;
  readonly username: string;
  readonly password?: SecretReference;
  readonly volume?: string;
  readonly walEnabled: boolean;
  readonly migrationImage: string;
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
    this.walEnabled = config.wal_enabled ?? false;
    this.migrationImage = config.migrationImage ?? "ghcr.io/amacneil/dbmate:2.33.0";
  }

  override async init() {
    await super.init();
    await mkdir(path.resolve(this.name, "migrations"), { recursive: true });
    if (
      !(await hasDependency("dbmate")) ||
      !(await fileExists(path.resolve("node_modules", ".bin", "dbmate")))
    ) {
      await installDependencies(["dbmate"], {
        development: true,
        logSink: this.getRuntimeLogSink(),
        serviceName: this.migrationLogServiceName,
      });
    }
  }

  override async getEnvironmentVariables(
    stage: string,
    target: ServiceEnvironmentTarget = "container",
  ): Promise<Record<string, string>> {
    const connection = await this.getConnectionInfo(stage, target);
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

  override async dev() {
    await super.dev();
    await this.runMigrations("local", {
      rootDir: process.cwd(),
      dbmateArgs: ["--wait", "--no-dump-schema", "migrate"],
      readOnly: true,
    });
  }

  override async deploy(stage: string) {
    await super.deploy(stage);
    await this.runMigrations(stage, {
      rootDir: process.cwd(),
      dbmateArgs: ["--wait", "--no-dump-schema", "migrate"],
      readOnly: true,
    });
  }

  async getConnectionInfo(
    stage: string,
    target: PostgresConnectionTarget = "host",
  ): Promise<PostgresConnectionInfo> {
    const password = await this.resolvePassword(stage);
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
    return withSslModeDisabled(
      `postgresql://${encodeURIComponent(connection.username)}:${encodeURIComponent(
        connection.password,
      )}@${connection.host}:${connection.port}/${connection.database}`,
    );
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
      volumes: [`${this.getVolumeName(stage)}:${POSTGRES_VOLUME_DIRECTORY}`],
      ports: deploy && this.port == null ? [] : [`${this.getHostPort(stage)}:5432`],
      command: this.walEnabled ? ["postgres", "-c", "wal_level=logical"] : config.command,
    };
  }

  protected override async onContainerStarted(stage: string) {
    await this.setOutputs(this.toOutputs(await this.getConnectionInfo(stage, "host")), stage);
  }

  async runMigrations(
    stage: string,
    options: {
      rootDir: string;
      dbmateArgs: string[];
      readOnly?: boolean;
      dryRun?: boolean;
    },
  ) {
    const sourceDirectory = path.join(options.rootDir, this.name, "migrations");
    let migrationFiles: string[];
    try {
      const result = await stat(sourceDirectory);
      if (!result.isDirectory()) {
        throw new Error("No migrations");
      }
      migrationFiles = await listFiles(sourceDirectory);
    } catch {
      // no migrations to run
      return;
    }
    if (migrationFiles.length === 0) return;

    this.writeMigrationLog(
      `${options.dryRun ? "Dry run" : "Run"} migrations for ${this.name} (${stage})\n`,
    );

    if (stage === "local") {
      await this.runLocalMigrations(stage, {
        rootDir: options.rootDir,
        sourceDirectory,
        dbmateArgs: options.dbmateArgs,
        dryRun: options.dryRun,
      });
      this.writeMigrationLog(`Finished migrations for ${this.name} (${stage})\n`);
      return;
    }

    const relativeDirectory = `${this.name}/migrations`;
    const remoteDirectory = path.posix.join(this.getAppDirectory(stage), relativeDirectory);
    const runtimeFiles: RuntimeFile[] = [];

    await this.host.exec(
      [`rm -rf ${shellQuote(remoteDirectory)}`, `mkdir -p ${shellQuote(remoteDirectory)}`].join(
        "\n",
      ),
      { dryRun: options.dryRun },
    );

    try {
      for (const file of migrationFiles) {
        const relativeFile = path
          .relative(sourceDirectory, file)
          .split(path.sep)
          .join(path.posix.sep);
        runtimeFiles.push(
          await this.writeRemoteRuntimeFile(
            stage,
            path.posix.join(relativeDirectory, relativeFile),
            await readFile(file, "utf8"),
            options.dryRun,
          ),
        );
      }

      await this.runMigrationContainer(stage, {
        migrationVolume: `${remoteDirectory}:/db/migrations${options.readOnly ? ":ro" : ""}`,
        dbmateArgs: options.dbmateArgs,
        dryRun: options.dryRun,
      });
      this.writeMigrationLog(`Finished migrations for ${this.name} (${stage})\n`);
    } finally {
      for (const runtimeFile of runtimeFiles.reverse()) {
        await this.removeRemoteRuntimeFile(runtimeFile, options.dryRun);
      }
      await this.host.exec(`rm -rf ${shellQuote(remoteDirectory)}`, { dryRun: options.dryRun });
    }
  }

  private async runMigrationContainer(
    stage: string,
    options: { migrationVolume: string; dbmateArgs: string[]; dryRun?: boolean },
  ) {
    const connection = await this.getConnectionInfo(stage, "container");
    const config: DockerRunConfig = {
      name: `${this.getContainerName(stage)}-migrations`,
      image: this.migrationImage,
      network: this.getNetwork(stage),
      pull: true,
      env: {
        DATABASE_URL: connection.url,
        DBMATE_MIGRATIONS_DIR: "/db/migrations",
      },
      volumes: [options.migrationVolume],
      command: options.dbmateArgs,
      healthCheck: false,
      labels: {
        "saws.service": this.name,
        "saws.serviceType": this.serviceType,
        "saws.stage": stage,
        "saws.task": "postgres-migrations",
      },
    };

    await this.runEphemeralContainer(stage, config, {
      dryRun: options.dryRun,
      logServiceName: this.migrationLogServiceName,
    });
  }

  private async runLocalMigrations(
    stage: string,
    options: { rootDir: string; sourceDirectory: string; dbmateArgs: string[]; dryRun?: boolean },
  ) {
    const connection = await this.getConnectionInfo(stage, "host");
    const command = [
      `DATABASE_URL=${shellQuote(connection.url)}`,
      `DBMATE_MIGRATIONS_DIR=${shellQuote(options.sourceDirectory)}`,
      shellQuote(path.resolve(options.rootDir, "node_modules", ".bin", "dbmate")),
      ...options.dbmateArgs.map(shellQuote),
    ].join(" ");

    await runLocal(command, {
      dryRun: options.dryRun,
      logSink: this.getRuntimeLogSink(),
      serviceName: this.migrationLogServiceName,
    });
  }

  private writeMigrationLog(chunk: string, stream: "stdout" | "stderr" = "stdout") {
    const sink = this.getRuntimeLogSink();
    if (sink == null) {
      this.writeRuntimeLog(chunk, stream);
      return;
    }

    sink({
      serviceName: this.migrationLogServiceName,
      stream,
      chunk,
      timestamp: new Date(),
    });
  }

  private get migrationLogServiceName() {
    return `${this.name}--migrations`;
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

  private async getOrCreateManagedPassword(stage: string) {
    const manager = new SecretsManager({ stage });
    const secretName = `${this.name}-postgres-password`;

    try {
      return await manager.get(secretName);
    } catch (error) {
      if ((error as Error).name !== "ParameterNotFound") throw error;
    }

    const password = randomBytes(24).toString("base64url");
    await manager.set(secretName, password);
    return password;
  }

  private async resolvePassword(stage: string) {
    return this.password == null
      ? this.getOrCreateManagedPassword(stage)
      : this.password.resolve({ stage });
  }
}

function isPostgresService(service: ServiceDefinition): service is PostgresService {
  return service instanceof PostgresService;
}

function withSslModeDisabled(databaseUrl: string) {
  const url = new URL(databaseUrl);
  if (!url.searchParams.has("sslmode")) {
    url.searchParams.set("sslmode", "disable");
  }
  return url.toString();
}

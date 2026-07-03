import { randomBytes } from "node:crypto";
import {
  access,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import {
  DeployContext,
  DevContext,
  type InitContext,
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
import { SecretReference, SecretsManager } from "@saws/secrets";
import { createMigrateCommand } from "./migrate-command.js";

export interface PostgresDockerServiceConfig
  extends Omit<
    DockerServiceConfig,
    "image" | "dockerfile" | "buildContext" | "ports" | "volumes"
  > {
  image?: string;
  /** Host port to expose Postgres on. Omit to keep it private to the Docker network. */
  port?: number;
  /** Database created by the Postgres image and used in generated connection URLs. */
  database?: string;
  /** Postgres superuser created by the Postgres image. Defaults to "postgres". */
  username?: string;
  /** Plaintext password or a stage-aware SAWS secret reference. */
  password?: string | SecretReference;
  /** Override the Docker volume name. By default SAWS derives a stable stage/service volume. */
  volume?: string;
  dataDirectory?: string;
  /** dbmate image used to apply migrations during deployment. */
  migrationImage?: string;
}

export interface PostgresConnectionInfo {
  host: string;
  port: string;
  username: string;
  password: string;
  database: string;
}

export class PostgresDockerService extends DockerService {
  static override getCommands() {
    return [createMigrateCommand()];
  }

  readonly port?: number;
  readonly database?: string;
  readonly username: string;
  readonly password?: string | SecretReference;
  readonly volume?: string;
  readonly dataDirectory: string;
  readonly migrationImage: string;

  constructor(config: PostgresDockerServiceConfig) {
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
    this.dataDirectory = config.dataDirectory ?? "/var/lib/postgresql";
    this.migrationImage =
      config.migrationImage ?? "ghcr.io/amacneil/dbmate:v2.33.0";
  }

  get envPrefix() {
    return this.name.replaceAll("-", "_").toUpperCase();
  }

  protected override get serviceType() {
    return "postgres-docker";
  }

  protected override async onInit(context: InitContext) {
    const packageChanged = await ensureDbmateDependency(context);
    const migrationsDirectory = path.join(
      context.rootDir,
      "db",
      "migrations"
    );

    if (context.dryRun) {
      context.writeLog(`[dry-run:local] mkdir ${migrationsDirectory}\n`);
    } else {
      await mkdir(migrationsDirectory, { recursive: true });
    }

    if (
      packageChanged ||
      !(await fileExists(
        path.join(context.rootDir, "node_modules", ".bin", "dbmate")
      ))
    ) {
      await this.installDependencies(context);
    }
  }

  protected async installDependencies(context: InitContext) {
    if (context.dryRun) {
      context.writeLog(`[dry-run:local] npm install (cwd: ${context.rootDir})\n`);
      return;
    }

    await runToCompletion("npm", ["install"], {
      cwd: context.rootDir,
      env: context.env,
      context,
    });
  }

  protected override async getContainerEnvironment(context: RuntimeContext) {
    const connection = await this.getConnectionInfo(context);
    return {
      ...await super.getContainerEnvironment(context),
      POSTGRES_USER: connection.username,
      POSTGRES_PASSWORD: connection.password,
      POSTGRES_DB: connection.database,
    };
  }

  protected override async getDockerRunConfig(context: RuntimeContext) {
    const config = await super.getDockerRunConfig(context);
    return {
      ...config,
      volumes: [`${this.getVolumeName(context)}:${this.dataDirectory}`],
      ports: context instanceof DevContext
        ? [`${this.port ?? 5432}:5432`]
        : this.port == null ? [] : [`${this.port}:5432`],
    };
  }

  protected override async onDeploy(context: DeployContext) {
    await super.onDeploy(context);
    await this.runMigrations(context);
  }

  protected override async onContainerStarted(context: RuntimeContext) {
    this.setOutputs(
      context.stage,
      this.toOutputs(await this.getConnectionInfo(context))
    );
  }

  protected async runMigrations(context: DeployContext) {
    const sourceDirectory = path.join(context.rootDir, "db", "migrations");
    const migrationFiles = await listMigrationFiles(sourceDirectory);
    const relativeDirectory = `${this.name}/migrations`;
    const remoteDirectory = path.posix.join(
      this.docker.getAppDirectory(context),
      relativeDirectory
    );
    const runtimeFiles = [];

    await this.docker.host.exec(
      [
        `rm -rf ${this.docker.host.shellQuote(remoteDirectory)}`,
        `mkdir -p ${this.docker.host.shellQuote(remoteDirectory)}`,
      ].join("\n"),
      { dryRun: context.dryRun }
    );

    try {
      for (const fileName of migrationFiles) {
        runtimeFiles.push(
          await this.docker.writeRuntimeFile(
            context,
            `${relativeDirectory}/${fileName}`,
            await readFile(path.join(sourceDirectory, fileName), "utf8")
          )
        );
      }

      const connection = await this.getConnectionInfo(context, "container");
      const databaseUrl = withSslModeDisabled(this.toDatabaseUrl(connection));
      const environmentFile = await this.docker.writeRuntimeFile(
        context,
        `${this.name}/migrations.env`,
        `DATABASE_URL=${databaseUrl}\n`
      );
      runtimeFiles.push(environmentFile);

      await this.docker.host.exec(
        `docker pull ${this.docker.host.shellQuote(this.migrationImage)}`,
        { dryRun: context.dryRun }
      );
      await this.docker.host.exec(
        [
          "docker run --rm",
          `--network ${this.docker.host.shellQuote(this.docker.getNetwork(context))}`,
          `--env-file ${this.docker.host.shellQuote(environmentFile.remotePath)}`,
          `-v ${this.docker.host.shellQuote(`${remoteDirectory}:/db/migrations:ro`)}`,
          this.docker.host.shellQuote(this.migrationImage),
          "--wait --no-dump-schema migrate",
        ].join(" "),
        { dryRun: context.dryRun }
      );
    } finally {
      for (const runtimeFile of runtimeFiles.reverse()) {
        await this.docker.removeRuntimeFile(context, runtimeFile);
      }
      await this.docker.host.exec(
        `rm -rf ${this.docker.host.shellQuote(remoteDirectory)}`,
        { dryRun: context.dryRun }
      );
    }
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
      [`${prefix}_POSTGRES_HOST`]: connection.host,
      [`${prefix}_POSTGRES_PORT`]: connection.port,
      [`${prefix}_POSTGRES_USERNAME`]: connection.username,
      [`${prefix}_POSTGRES_PASSWORD`]: connection.password,
      [`${prefix}_POSTGRES_DB_NAME`]: connection.database,
      [`${prefix}_DATABASE_URL`]: this.toDatabaseUrl(connection),
    };
  }

  private async getConnectionInfo(
    context: RuntimeContext,
    target: EnvironmentVariableTarget = "host"
  ): Promise<PostgresConnectionInfo> {
    const password = this.password instanceof SecretReference
      ? await this.password.resolve(context)
      : this.password ?? await this.getOrCreatePassword(context);
    const containerName = this.getContainerName(context);

    return {
      host: target === "container" ? containerName : isLocal(context) ? "localhost" : containerName,
      port: target === "container" ? "5432" : String(this.port ?? 5432),
      username: this.username,
      password,
      database: this.database ?? this.defaultDatabaseName(context),
    };
  }

  private toOutputs(connection: PostgresConnectionInfo): ServiceOutputs {
    return {
      postgresHost: connection.host,
      postgresPort: connection.port,
      postgresUsername: connection.username,
      postgresPassword: connection.password,
      postgresDBName: connection.database,
      databaseUrl: this.toDatabaseUrl(connection),
    };
  }

  private toDatabaseUrl(connection: PostgresConnectionInfo) {
    return `postgresql://${encodeURIComponent(connection.username)}:${encodeURIComponent(connection.password)}@${connection.host}:${connection.port}/${connection.database}`;
  }

  private getVolumeName(context: RuntimeContext) {
    return (
      this.volume ??
      `${context.stage}-${this.name}-postgres-data`
        .replaceAll("_", "-")
        .toLowerCase()
    );
  }

  private defaultDatabaseName(context: RuntimeContext) {
    return `${context.stage}_${this.name}`.replaceAll("-", "_").toLowerCase();
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
    return `${this.name}-postgres-password`;
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

async function ensureDbmateDependency(context: InitContext) {
  const packagePath = path.join(context.rootDir, "package.json");
  let packageJson: Record<string, unknown>;

  try {
    packageJson = JSON.parse(await readFile(packagePath, "utf8")) as Record<
      string,
      unknown
    >;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    packageJson = {};
  }

  const devDependencies = toRecord(packageJson.devDependencies);
  const updated = {
    ...packageJson,
    name: packageJson.name ?? toPackageName(path.basename(context.rootDir)),
    private: packageJson.private ?? true,
    devDependencies: {
      dbmate: "^2.0.0",
      ...devDependencies,
    },
  };
  const contents = `${JSON.stringify(updated, null, 2)}\n`;
  const current = await readFile(packagePath, "utf8").catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    }
  );

  if (current === contents) return false;
  if (context.dryRun) {
    context.writeLog(`[dry-run:local] write ${packagePath}\n`);
    return true;
  }

  await mkdir(context.rootDir, { recursive: true });
  await writeFile(packagePath, contents);
  return true;
}

function toRecord(value: unknown): Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function toPackageName(value: string) {
  const name = value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "");
  return name.length === 0 ? "saws-project" : name;
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

async function listMigrationFiles(directory: string) {
  try {
    return (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

function withSslModeDisabled(databaseUrl: string) {
  const url = new URL(databaseUrl);
  if (!url.searchParams.has("sslmode")) {
    url.searchParams.set("sslmode", "disable");
  }
  return url.toString();
}

async function runToCompletion(
  command: string,
  args: string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    context: RuntimeContext;
  }
) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio:
        options.context.logSink == null
          ? "inherit"
          : ["ignore", "pipe", "pipe"],
    });
    child.stdout?.on("data", (chunk: Buffer) => {
      options.context.writeLog(chunk.toString("utf8"), "stdout");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      options.context.writeLog(chunk.toString("utf8"), "stderr");
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `${command} exited with code ${code ?? "unknown"}${signal == null ? "" : ` (${signal})`}`
        )
      );
    });
  });
}

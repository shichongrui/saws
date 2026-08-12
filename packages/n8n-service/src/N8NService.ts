import {
  DockerService,
  type DockerServiceConfig,
  type DockerRunConfig,
} from "@saws/docker-service";
import type { PostgresService } from "@saws/postgres-service";

const N8N_DATA_DIRECTORY = "/home/node/.n8n";
const N8N_DEFAULT_PORT = 5678;

export interface N8NServiceConfig extends Omit<
  DockerServiceConfig,
  "image" | "dockerfile" | "buildContext" | "volumes" | "ports" | "command"
> {
  /** n8n Docker image. Defaults to the current stable image published by n8n. */
  image?: string;
  /** Host and container port for the n8n editor and webhooks. Defaults to 5678. */
  port?: number;
  /** Override the Docker volume name used for n8n configuration and encryption keys. */
  volume?: string;
  /** Sets both TZ and GENERIC_TIMEZONE for n8n's runtime and scheduled workflows. */
  timezone?: string;
  /** PostgreSQL instance used by n8n instead of its default SQLite database. */
  postgres?: PostgresService;
}

export class N8NService extends DockerService {
  readonly port: number;
  readonly volume?: string;
  readonly timezone?: string;
  readonly postgres?: PostgresService;
  protected override readonly serviceType = "n8n";

  constructor(config: N8NServiceConfig) {
    const port = config.port ?? N8N_DEFAULT_PORT;

    super({
      ...config,
      image: config.image ?? "docker.n8n.io/n8nio/n8n",
      dependencies: [
        ...(config.dependencies ?? []),
        ...(config.postgres == null ? [] : [config.postgres]),
      ],
      healthCheck: config.healthCheck ?? {
        command: `node -e "fetch('http://127.0.0.1:${port}/healthz').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"`,
        interval: "10s",
        timeout: "5s",
        retries: 5,
        startPeriod: "20s",
      },
    });

    this.port = port;
    this.volume = config.volume;
    this.timezone = config.timezone;
    this.postgres = config.postgres;
  }

  protected override async getContainerEnvironment(stage: string): Promise<Record<string, string>> {
    const postgres =
      this.postgres == null ? undefined : await this.postgres.getConnectionInfo(stage, "container");

    return {
      ...(await super.getContainerEnvironment(stage)),
      N8N_PORT: String(this.port),
      N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS: "true",
      ...(this.timezone == null
        ? {}
        : {
            TZ: this.timezone,
            GENERIC_TIMEZONE: this.timezone,
          }),
      ...(postgres == null
        ? {}
        : {
            DB_TYPE: "postgresdb",
            DB_POSTGRESDB_DATABASE: postgres.database,
            DB_POSTGRESDB_HOST: postgres.host,
            DB_POSTGRESDB_PORT: postgres.port,
            DB_POSTGRESDB_USER: postgres.username,
            DB_POSTGRESDB_SCHEMA: "public",
            DB_POSTGRESDB_PASSWORD: postgres.password,
          }),
    };
  }

  protected override async getDockerRunConfig(stage: string, deploy: boolean) {
    const config = await super.getDockerRunConfig(stage, deploy);

    return {
      ...config,
      volumes: [`${this.getVolumeName(stage)}:${N8N_DATA_DIRECTORY}`],
      ports: [`${this.port}:${this.port}`],
    } satisfies DockerRunConfig;
  }

  private getVolumeName(stage: string) {
    return this.volume ?? `${stage}-${this.name}-n8n-data`;
  }
}

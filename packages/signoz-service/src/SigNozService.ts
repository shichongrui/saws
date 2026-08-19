import type { ServiceDefinition, ServiceEnvironmentTarget } from "@saws/core";
import type { ClickHouseService } from "@saws/clickhouse-service";
import {
  DockerService,
  type DockerRunConfig,
  type DockerServiceConfig,
} from "@saws/docker-service";
import type { PostgresService } from "@saws/postgres-service";

const SIGNOZ_PORT = 8080;
const SIGNOZ_OPAMP_PORT = 4320;

export interface SigNozServiceConfig extends Omit<
  DockerServiceConfig,
  "image" | "dockerfile" | "buildContext" | "volumes" | "ports" | "entrypoint" | "command"
> {
  /** PostgreSQL metastore used by SigNoz. */
  postgres: PostgresService;
  /** ClickHouse telemetry store used by SigNoz. */
  clickhouse: ClickHouseService;
  /** Services, such as the schema migrator, that must complete before SigNoz starts. */
  prerequisites?: ServiceDefinition[];
  /** SigNoz image. */
  image?: string;
  /** Host port for the SigNoz UI and API. Defaults to 8080. */
  port?: number;
}

export interface SigNozConnectionInfo {
  host: string;
  port: string;
  url: string;
}

export class SigNozService extends DockerService {
  readonly postgres: PostgresService;
  readonly clickhouse: ClickHouseService;
  readonly port: number;
  protected override readonly serviceType = "signoz";

  constructor(config: SigNozServiceConfig) {
    const port = config.port ?? SIGNOZ_PORT;
    super({
      ...config,
      image: config.image ?? "signoz/signoz:latest",
      dependencies: [
        ...(config.dependencies ?? []),
        config.postgres,
        config.clickhouse,
        ...(config.prerequisites ?? []),
      ],
      healthCheck: config.healthCheck ?? {
        command: `wget --spider -q http://localhost:${SIGNOZ_PORT}/api/v1/health`,
        interval: "30s",
        timeout: "10s",
        retries: 3,
        startPeriod: "60s",
      },
    });

    this.postgres = config.postgres;
    this.clickhouse = config.clickhouse;
    this.port = port;
  }

  override async getEnvironmentVariables(
    stage: string,
    target: ServiceEnvironmentTarget = "container",
  ): Promise<Record<string, string>> {
    const connection = this.getConnectionInfo(stage, target);
    const prefix = this.parameterizedEnvVarName("SIGNOZ");
    return {
      [`${prefix}_URL`]: connection.url,
    };
  }

  getConnectionInfo(
    stage: string,
    target: ServiceEnvironmentTarget = "host",
  ): SigNozConnectionInfo {
    const host =
      target === "container"
        ? this.getContainerName(stage)
        : stage === "local" || this.host == null
          ? "localhost"
          : this.host.address;
    const port = target === "container" ? SIGNOZ_PORT : this.port;
    return {
      host,
      port: String(port),
      url: `http://${host}:${port}`,
    };
  }

  /** Internal Docker-network endpoint used by managed OTel collectors. */
  getOpampUrl(stage: string) {
    return `ws://${this.getContainerName(stage)}:${SIGNOZ_OPAMP_PORT}`;
  }

  protected override async getContainerEnvironment(stage: string): Promise<Record<string, string>> {
    const postgres = await this.postgres.getConnectionInfo(stage, "container");
    const clickhouse = this.clickhouse.getConnectionInfo(stage, "container");
    return {
      ...(await super.getContainerEnvironment(stage)),
      SIGNOZ_SQLSTORE_POSTGRES_DSN: postgres.url.replace(/^postgresql:/, "postgres:"),
      SIGNOZ_SQLSTORE_PROVIDER: "postgres",
      SIGNOZ_TELEMETRYSTORE_CLICKHOUSE_DSN: clickhouse.url,
      SIGNOZ_TELEMETRYSTORE_PROVIDER: "clickhouse",
    };
  }

  protected override async getDockerRunConfig(stage: string, deploy: boolean) {
    const config = await super.getDockerRunConfig(stage, deploy);
    return {
      ...config,
      ports: [`${this.port}:${SIGNOZ_PORT}`],
    } satisfies DockerRunConfig;
  }
}

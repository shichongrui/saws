import { ServiceDefinition } from "@saws/core";
import type { ClickHouseService } from "@saws/clickhouse-service";
import {
  DockerService,
  type DockerRunConfig,
  type DockerServiceConfig,
} from "@saws/docker-service";

export interface SigNozSchemaMigrationServiceConfig extends Omit<
  DockerServiceConfig,
  | "image"
  | "dockerfile"
  | "buildContext"
  | "volumes"
  | "ports"
  | "entrypoint"
  | "command"
  | "healthCheck"
> {
  clickhouse: ClickHouseService;
  image?: string;
  /** Maximum time the migration CLI waits for ClickHouse. Defaults to 10m. */
  timeout?: string;
}

export class SigNozSchemaMigrationService extends DockerService {
  readonly clickhouse: ClickHouseService;
  readonly timeout: string;
  protected override readonly serviceType = "signoz-schema-migration";

  constructor(config: SigNozSchemaMigrationServiceConfig) {
    super({
      ...config,
      image: config.image ?? "signoz/signoz-otel-collector:latest",
      dependencies: [...(config.dependencies ?? []), config.clickhouse],
      entrypoint: "/bin/sh",
      command: [
        "-c",
        [
          "/signoz-otel-collector migrate ready",
          "/signoz-otel-collector migrate bootstrap",
          "/signoz-otel-collector migrate sync up",
          "/signoz-otel-collector migrate async up",
        ].join(" && "),
      ],
      healthCheck: false,
      restart: "no",
    });
    this.clickhouse = config.clickhouse;
    this.timeout = config.timeout ?? "10m";
  }

  override async dev() {
    await ServiceDefinition.prototype.dev.call(this);
    await this.runMigrations("local");
  }

  override async deploy(stage: string) {
    await ServiceDefinition.prototype.deploy.call(this, stage);
    await this.runMigrations(stage);
  }

  protected override async getContainerEnvironment(stage: string): Promise<Record<string, string>> {
    return {
      ...(await super.getContainerEnvironment(stage)),
      SIGNOZ_OTEL_COLLECTOR_CLICKHOUSE_DSN: this.clickhouse.getConnectionInfo(stage, "container")
        .url,
      SIGNOZ_OTEL_COLLECTOR_TIMEOUT: this.timeout,
    };
  }

  private async runMigrations(stage: string) {
    const config = await this.getDockerRunConfig(stage, stage !== "local");
    await this.runEphemeralContainer(stage, {
      ...config,
      name: `${config.name}-run`,
      labels: { ...config.labels, "saws.task": "signoz-schema-migrations" },
    } satisfies DockerRunConfig);
  }
}

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ServiceEnvironmentTarget } from "@saws/core";
import type { ClickHouseService } from "@saws/clickhouse-service";
import {
  DockerService,
  type ContainerRuntimeFile,
  type DockerRunConfig,
  type DockerServiceConfig,
} from "@saws/docker-service";
import type { SigNozService } from "@saws/signoz-service";
import type { SigNozSchemaMigrationService } from "./SigNozSchemaMigrationService.js";

const OTLP_GRPC_PORT = 4317;
const OTLP_HTTP_PORT = 4318;
const COLLECTOR_CONFIG_PATH = "/etc/otel-collector-config.yaml";
const OPAMP_CONFIG_PATH = "/etc/opamp-config.yaml";

export interface SigNozOtelCollectorServiceConfig extends Omit<
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
  signoz: SigNozService;
  migrations: SigNozSchemaMigrationService;
  image?: string;
  /** Host port for OTLP over gRPC. Defaults to 4317. */
  grpcPort?: number;
  /** Host port for OTLP over HTTP. Defaults to 4318. */
  httpPort?: number;
  /** Maximum time the collector waits for schema synchronization. Defaults to 10m. */
  timeout?: string;
}

export interface SigNozOtelCollectorConnectionInfo {
  host: string;
  grpcPort: string;
  httpPort: string;
  grpcUrl: string;
  httpUrl: string;
}

export class SigNozOtelCollectorService extends DockerService {
  readonly clickhouse: ClickHouseService;
  readonly signoz: SigNozService;
  readonly migrations: SigNozSchemaMigrationService;
  readonly grpcPort: number;
  readonly httpPort: number;
  readonly timeout: string;
  protected override readonly serviceType = "signoz-otel-collector";

  constructor(config: SigNozOtelCollectorServiceConfig) {
    super({
      ...config,
      image: config.image ?? "signoz/signoz-otel-collector:latest",
      dependencies: [
        ...(config.dependencies ?? []),
        config.clickhouse,
        config.signoz,
        config.migrations,
      ],
      entrypoint: "/bin/sh",
      command: [
        "-c",
        `/signoz-otel-collector migrate sync check && /signoz-otel-collector --config=${COLLECTOR_CONFIG_PATH} --manager-config=${OPAMP_CONFIG_PATH} --copy-path=/var/tmp/collector-config.yaml`,
      ],
      healthCheck: false,
    });
    this.clickhouse = config.clickhouse;
    this.signoz = config.signoz;
    this.migrations = config.migrations;
    this.grpcPort = config.grpcPort ?? OTLP_GRPC_PORT;
    this.httpPort = config.httpPort ?? OTLP_HTTP_PORT;
    this.timeout = config.timeout ?? "10m";
  }

  override async dev() {
    await this.writeLocalConfigs("local");
    await super.dev();
  }

  override async deploy(stage: string) {
    const files = this.getRuntimeFiles(stage);
    if (this.host != null) {
      await Promise.all(
        files.map((file) =>
          this.writeRemoteRuntimeFile(
            stage,
            `${this.name}/${path.posix.basename(file.path)}`,
            file.contents,
            {
              mode: 0o644,
            },
          ),
        ),
      );
    } else {
      await this.writeLocalConfigs(stage);
    }
    await super.deploy(stage);
  }

  override async getEnvironmentVariables(
    stage: string,
    target: ServiceEnvironmentTarget = "container",
  ): Promise<Record<string, string>> {
    const connection = this.getConnectionInfo(stage, target);
    const prefix = this.parameterizedEnvVarName("OTLP");
    return {
      [`${prefix}_GRPC_URL`]: connection.grpcUrl,
      [`${prefix}_HTTP_URL`]: connection.httpUrl,
    };
  }

  getConnectionInfo(
    stage: string,
    target: ServiceEnvironmentTarget = "host",
  ): SigNozOtelCollectorConnectionInfo {
    const host =
      target === "container"
        ? this.getContainerName(stage)
        : stage === "local" || this.host == null
          ? "localhost"
          : this.host.address;
    const grpcPort = target === "container" ? OTLP_GRPC_PORT : this.grpcPort;
    const httpPort = target === "container" ? OTLP_HTTP_PORT : this.httpPort;
    return {
      host,
      grpcPort: String(grpcPort),
      httpPort: String(httpPort),
      grpcUrl: `http://${host}:${grpcPort}`,
      httpUrl: `http://${host}:${httpPort}`,
    };
  }

  protected override async getContainerEnvironment(stage: string): Promise<Record<string, string>> {
    return {
      ...(await super.getContainerEnvironment(stage)),
      SIGNOZ_OTEL_COLLECTOR_CLICKHOUSE_DSN: this.clickhouse.getConnectionInfo(stage, "container")
        .url,
      SIGNOZ_OTEL_COLLECTOR_TIMEOUT: this.timeout,
    };
  }

  protected override async getDockerRunConfig(stage: string, deploy: boolean) {
    const config = await super.getDockerRunConfig(stage, deploy);
    return {
      ...config,
      volumes: [
        `${this.getConfigFilePath(stage, path.posix.basename(COLLECTOR_CONFIG_PATH))}:${COLLECTOR_CONFIG_PATH}:ro`,
        `${this.getConfigFilePath(stage, path.posix.basename(OPAMP_CONFIG_PATH))}:${OPAMP_CONFIG_PATH}:ro`,
      ],
      ports: [`${this.grpcPort}:${OTLP_GRPC_PORT}`, `${this.httpPort}:${OTLP_HTTP_PORT}`],
    } satisfies DockerRunConfig;
  }

  protected override async getContainerRuntimeFiles(
    stage: string,
  ): Promise<readonly ContainerRuntimeFile[]> {
    return this.getRuntimeFiles(stage);
  }

  private getConfigFilePath(stage: string, fileName: string) {
    const relativePath = `${this.name}/${fileName}`;
    if (stage !== "local" && this.host != null) {
      return path.posix.join(this.getAppDirectory(stage), relativePath);
    }
    return path.resolve(".saws", "runtime", stage, relativePath);
  }

  private async writeLocalConfigs(stage: string) {
    for (const file of this.getRuntimeFiles(stage)) {
      const configPath = this.getConfigFilePath(stage, path.posix.basename(file.path));
      await mkdir(path.dirname(configPath), { recursive: true });
      await writeFile(configPath, file.contents, { mode: 0o644 });
    }
  }

  private getRuntimeFiles(stage: string): readonly (ContainerRuntimeFile & { contents: string })[] {
    return [
      { path: COLLECTOR_CONFIG_PATH, contents: this.getCollectorConfig(stage) },
      {
        path: OPAMP_CONFIG_PATH,
        contents: `server_endpoint: ${this.signoz.getOpampUrl(stage)}/v1/opamp\n`,
      },
    ];
  }

  private getCollectorConfig(stage: string) {
    const clickhouse = this.clickhouse.getConnectionInfo(stage, "container");
    return `connectors:
  signozmeter:
    dimensions:
    - name: service.name
    - name: deployment.environment
    - name: host.name
    metrics_flush_interval: 1h
exporters:
  clickhouselogsexporter:
    dsn: ${clickhouse.url}/signoz_logs
    sending_queue:
      enabled: false
    timeout: 45s
    use_new_schema: true
  clickhousetraces:
    datasource: ${clickhouse.url}/signoz_traces
    low_cardinal_exception_grouping: \${env:LOW_CARDINAL_EXCEPTION_GROUPING}
    sending_queue:
      enabled: false
    timeout: 45s
    use_new_schema: true
  metadataexporter:
    cache:
      provider: in_memory
    dsn: ${clickhouse.url}/signoz_metadata
    enabled: true
    timeout: 45s
  signozclickhousemeter:
    dsn: ${clickhouse.url}/signoz_meter
    sending_queue:
      enabled: false
    timeout: 45s
  signozclickhousemetrics:
    dsn: ${clickhouse.url}/signoz_metrics
    sending_queue:
      enabled: false
    timeout: 45s
extensions:
  pprof:
    endpoint: 0.0.0.0:1777
  signoz_health_check:
    endpoint: 0.0.0.0:13133
processors:
  batch:
    send_batch_max_size: 55000
    send_batch_size: 50000
    timeout: 5s
  batch/meter:
    send_batch_max_size: 25000
    send_batch_size: 20000
    timeout: 5s
  signozspanmetrics/delta:
    aggregation_temporality: AGGREGATION_TEMPORALITY_DELTA
    dimensions:
    - default: default
      name: service.namespace
    - default: default
      name: deployment.environment
    - name: signoz.collector.id
    - name: service.version
    dimensions_cache_size: 100000
    enable_exp_histogram: true
    latency_histogram_buckets:
    - 100us
    - 1ms
    - 2ms
    - 6ms
    - 10ms
    - 50ms
    - 100ms
    - 250ms
    - 500ms
    - 1000ms
    - 1400ms
    - 2000ms
    - 5s
    - 10s
    - 20s
    - 40s
    - 60s
    metrics_exporter: signozclickhousemetrics
    metrics_flush_interval: 60s
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:${OTLP_GRPC_PORT}
      http:
        endpoint: 0.0.0.0:${OTLP_HTTP_PORT}
service:
  extensions:
  - signoz_health_check
  - pprof
  pipelines:
    logs:
      exporters:
      - clickhouselogsexporter
      - signozmeter
      - metadataexporter
      processors:
      - batch
      receivers:
      - otlp
    metrics:
      exporters:
      - signozclickhousemetrics
      - signozmeter
      - metadataexporter
      processors:
      - batch
      receivers:
      - otlp
    metrics/meter:
      exporters:
      - signozclickhousemeter
      processors:
      - batch/meter
      receivers:
      - signozmeter
    traces:
      exporters:
      - clickhousetraces
      - signozmeter
      - metadataexporter
      processors:
      - signozspanmetrics/delta
      - batch
      receivers:
      - otlp
  telemetry:
    logs:
      encoding: json
`;
  }
}

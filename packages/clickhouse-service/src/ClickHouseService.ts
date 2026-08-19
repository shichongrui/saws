import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ServiceDefinition, type ServiceEnvironmentTarget } from "@saws/core";
import type { ClickHouseKeeperService } from "@saws/clickhouse-keeper-service";
import {
  DockerService,
  type ContainerRuntimeFile,
  type DockerRunConfig,
  type DockerServiceConfig,
} from "@saws/docker-service";

const CLICKHOUSE_TCP_PORT = 9000;
const CLICKHOUSE_HTTP_PORT = 8123;
const CLICKHOUSE_CONFIG_PATH = "/etc/clickhouse-server/config-0-0.yaml";
const CLICKHOUSE_FUNCTIONS_PATH = "/etc/clickhouse-server/functions.yaml";
const CLICKHOUSE_DATA_PATH = "/var/lib/clickhouse";
const CLICKHOUSE_USER_SCRIPTS_PATH = "/var/lib/clickhouse/user_scripts";

export interface ClickHouseServiceConfig extends Omit<
  DockerServiceConfig,
  "image" | "dockerfile" | "buildContext" | "volumes" | "ports" | "entrypoint" | "command"
> {
  /** Keeper instance used for ClickHouse coordination. */
  keeper: ClickHouseKeeperService;
  /** ClickHouse image. Defaults to the version used by the SigNoz Foundry stack. */
  image?: string;
  /** Optional host port for ClickHouse's native protocol. */
  port?: number;
  /** Optional host port for ClickHouse's HTTP interface. */
  httpPort?: number;
  /** Override the stage-specific ClickHouse data volume. */
  volume?: string;
  /** Override the shared executable user-scripts volume. */
  userScriptsVolume?: string;
}

export interface ClickHouseConnectionInfo {
  host: string;
  port: string;
  httpPort: string;
  url: string;
  httpUrl: string;
}

export class ClickHouseService extends DockerService {
  readonly keeper: ClickHouseKeeperService;
  readonly port?: number;
  readonly httpPort?: number;
  readonly volume?: string;
  readonly userScriptsVolume?: string;
  protected override readonly serviceType = "clickhouse";
  private readonly userScripts: ClickHouseUserScriptsService;

  constructor(config: ClickHouseServiceConfig) {
    const image = config.image ?? "clickhouse/clickhouse-server:25.12.5";
    const userScripts = new ClickHouseUserScriptsService({
      name: `${config.name}-user-scripts`,
      host: config.host,
      appDirectory: config.appDirectory,
      network: config.network,
      image,
      volume: config.userScriptsVolume,
    });

    super({
      ...config,
      image,
      dependencies: [...(config.dependencies ?? []), config.keeper, userScripts],
      healthCheck: config.healthCheck ?? {
        command: `wget --spider -q http://localhost:${CLICKHOUSE_HTTP_PORT}/ping`,
        interval: "30s",
        timeout: "10s",
        retries: 3,
        startPeriod: "40s",
      },
    });

    this.keeper = config.keeper;
    this.port = config.port;
    this.httpPort = config.httpPort;
    this.volume = config.volume;
    this.userScriptsVolume = config.userScriptsVolume;
    this.userScripts = userScripts;
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
    const prefix = this.parameterizedEnvVarName("CLICKHOUSE");
    return {
      [`${prefix}_HOST`]: connection.host,
      [`${prefix}_PORT`]: connection.port,
      [`${prefix}_HTTP_PORT`]: connection.httpPort,
      [`${prefix}_URL`]: connection.url,
      [`${prefix}_HTTP_URL`]: connection.httpUrl,
    };
  }

  getConnectionInfo(
    stage: string,
    target: ServiceEnvironmentTarget = "host",
  ): ClickHouseConnectionInfo {
    const host =
      target === "container"
        ? this.getContainerName(stage)
        : stage === "local" || this.host == null
          ? "localhost"
          : this.host.address;
    const port = target === "container" ? CLICKHOUSE_TCP_PORT : (this.port ?? CLICKHOUSE_TCP_PORT);
    const httpPort =
      target === "container" ? CLICKHOUSE_HTTP_PORT : (this.httpPort ?? CLICKHOUSE_HTTP_PORT);

    return {
      host,
      port: String(port),
      httpPort: String(httpPort),
      url: `tcp://${host}:${port}`,
      httpUrl: `http://${host}:${httpPort}`,
    };
  }

  protected override async getContainerEnvironment(stage: string): Promise<Record<string, string>> {
    return {
      ...(await super.getContainerEnvironment(stage)),
      CLICKHOUSE_SKIP_USER_SETUP: "1",
      CLICKHOUSE_CONFIG: CLICKHOUSE_CONFIG_PATH,
    };
  }

  protected override async getDockerRunConfig(stage: string, deploy: boolean) {
    const config = await super.getDockerRunConfig(stage, deploy);
    const ports = [
      ...(deploy && this.port == null
        ? []
        : [`${this.port ?? CLICKHOUSE_TCP_PORT}:${CLICKHOUSE_TCP_PORT}`]),
      ...(deploy && this.httpPort == null
        ? []
        : [`${this.httpPort ?? CLICKHOUSE_HTTP_PORT}:${CLICKHOUSE_HTTP_PORT}`]),
    ];

    return {
      ...config,
      volumes: [
        `${this.getVolumeName(stage)}:${CLICKHOUSE_DATA_PATH}`,
        `${this.userScripts.getVolumeName(stage)}:${CLICKHOUSE_USER_SCRIPTS_PATH}:ro`,
        `${this.getConfigFilePath(stage, "config-0-0.yaml")}:${CLICKHOUSE_CONFIG_PATH}:ro`,
        `${this.getConfigFilePath(stage, "functions.yaml")}:${CLICKHOUSE_FUNCTIONS_PATH}:ro`,
      ],
      ports,
    } satisfies DockerRunConfig;
  }

  protected override async getContainerRuntimeFiles(
    stage: string,
  ): Promise<readonly ContainerRuntimeFile[]> {
    return this.getRuntimeFiles(stage);
  }

  private getVolumeName(stage: string) {
    return this.volume ?? `${stage}-${this.name}-data`;
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
      { path: CLICKHOUSE_CONFIG_PATH, contents: this.getConfig(stage) },
      { path: CLICKHOUSE_FUNCTIONS_PATH, contents: FUNCTIONS_CONFIG },
    ];
  }

  private getConfig(stage: string) {
    const keeper = this.keeper.getConnectionInfo(stage, "container");
    return `asynchronous_metric_log:
  ttl: event_date + INTERVAL 1 DAY DELETE
dictionaries_config: '*_dictionary.xml'
display_name: cluster
distributed_ddl:
  path: /clickhouse/task_queue/ddl
error_log:
  ttl: event_date + INTERVAL 1 DAY DELETE
format_schema_path: /var/lib/clickhouse/format_schemas/
http_port: ${CLICKHOUSE_HTTP_PORT}
interserver_http_port: 9009
latency_log:
  ttl: event_date + INTERVAL 1 DAY DELETE
listen_host: 0.0.0.0
logger:
  console: 1
  count: 10
  formatting:
    type: console
  level: information
  size: 1000M
macros:
  replica: "00"
  shard: "00"
metric_log:
  flush_interval_milliseconds: 30000
  ttl: event_date + INTERVAL 1 DAY DELETE
part_log:
  ttl: event_date + INTERVAL 1 DAY DELETE
path: /var/lib/clickhouse/
processors_profile_log:
  flush_interval_milliseconds: 30000
  ttl: event_date + INTERVAL 1 DAY DELETE
profiles:
  default:
    allow_simdjson: 0
    load_balancing: random
    log_queries: 1
query_log:
  flush_interval_milliseconds: 30000
  partition_by: toYYYYMM(event_date)
  ttl: event_date + INTERVAL 1 DAY DELETE
query_metric_log:
  ttl: event_date + INTERVAL 1 DAY DELETE
query_thread_log:
  ttl: event_date + INTERVAL 1 DAY DELETE
query_views_log:
  ttl: event_date + INTERVAL 1 DAY DELETE
quotas:
  default:
    interval:
      duration: 3600
      errors: 0
      execution_time: 0
      queries: 0
      read_rows: 0
      result_rows: 0
remote_servers:
  cluster:
    shard:
    - replica:
      - host: ${this.getContainerName(stage)}
        port: ${CLICKHOUSE_TCP_PORT}
session_log:
  ttl: event_date + INTERVAL 1 DAY DELETE
tcp_port: ${CLICKHOUSE_TCP_PORT}
text_log:
  flush_interval_milliseconds: 30000
  ttl: event_date + INTERVAL 1 DAY DELETE
tmp_path: /var/lib/clickhouse/tmp/
trace_log:
  flush_interval_milliseconds: 30000
  ttl: event_date + INTERVAL 1 DAY DELETE
user_defined_executable_functions_config: '*functions.yaml'
user_directories:
  users_xml:
    path: config-0-0.yaml
user_files_path: /var/lib/clickhouse/user_files/
user_scripts_path: /var/lib/clickhouse/user_scripts/
users:
  default:
    access_management: 1
    named_collection_control: 1
    networks:
      ip: ::/0
    password: ""
    profile: default
    quota: default
    show_named_collection: 1
    show_named_collection_secrets: 1
zookeeper:
  node:
  - host: ${keeper.host}
    port: ${keeper.port}
zookeeper_log:
  ttl: event_date + INTERVAL 1 DAY DELETE
`;
  }
}

interface ClickHouseUserScriptsServiceConfig {
  name: string;
  host: DockerServiceConfig["host"];
  appDirectory?: string;
  network?: string;
  image: string;
  volume?: string;
}

class ClickHouseUserScriptsService extends DockerService {
  private readonly volume?: string;
  protected override readonly serviceType = "clickhouse-user-scripts";

  constructor(config: ClickHouseUserScriptsServiceConfig) {
    super({
      ...config,
      healthCheck: false,
      entrypoint: "/bin/bash",
      command: ["-c", HISTOGRAM_INSTALL_COMMAND],
      restart: "no",
    });
    this.volume = config.volume;
  }

  override async dev() {
    await ServiceDefinition.prototype.dev.call(this);
    await this.run("local");
  }

  override async deploy(stage: string) {
    await ServiceDefinition.prototype.deploy.call(this, stage);
    await this.run(stage);
  }

  getVolumeName(stage: string) {
    return this.volume ?? `${stage}-${this.name}`;
  }

  private async run(stage: string) {
    const config = await this.getDockerRunConfig(stage, stage !== "local");
    await this.runEphemeralContainer(stage, {
      ...config,
      volumes: [`${this.getVolumeName(stage)}:${CLICKHOUSE_USER_SCRIPTS_PATH}`],
    });
  }
}

const HISTOGRAM_INSTALL_COMMAND = `set -eu
version="v0.0.1"
node_os=$(uname -s | tr '[:upper:]' '[:lower:]')
node_arch=$(uname -m | sed s/aarch64/arm64/ | sed s/x86_64/amd64/)
cd /tmp
wget -q -O histogram-quantile.tar.gz "https://github.com/SigNoz/signoz/releases/download/histogram-quantile%2F${"$"}{version}/histogram-quantile_${"$"}{node_os}_${"$"}{node_arch}.tar.gz"
tar -xzf histogram-quantile.tar.gz
mv histogram-quantile ${CLICKHOUSE_USER_SCRIPTS_PATH}/histogramQuantile
chmod 755 ${CLICKHOUSE_USER_SCRIPTS_PATH}/histogramQuantile`;

const FUNCTIONS_CONFIG = `functions:
  argument:
  - name: buckets
    type: Array(Float64)
  - name: counts
    type: Array(Float64)
  - name: quantile
    type: Float64
  command: ./histogramQuantile
  format: CSV
  name: histogramQuantile
  return_type: Float64
  type: executable
`;

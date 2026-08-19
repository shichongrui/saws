import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ServiceEnvironmentTarget } from "@saws/core";
import {
  DockerService,
  type ContainerRuntimeFile,
  type DockerRunConfig,
  type DockerServiceConfig,
} from "@saws/docker-service";

const KEEPER_CLIENT_PORT = 9181;
const KEEPER_RAFT_PORT = 9234;
const KEEPER_CONFIG_PATH = "/etc/clickhouse-keeper/keeper.yaml";
const KEEPER_DATA_PATH = "/var/lib/clickhouse-keeper";

export interface ClickHouseKeeperServiceConfig extends Omit<
  DockerServiceConfig,
  "image" | "dockerfile" | "buildContext" | "volumes" | "ports" | "entrypoint" | "command"
> {
  /** ClickHouse Keeper image. Defaults to the version used by the SigNoz Foundry stack. */
  image?: string;
  /** Optional host port for Keeper clients. Remote deployments remain private when omitted. */
  port?: number;
  /** Override the stage-specific Keeper data volume. */
  volume?: string;
}

export interface ClickHouseKeeperConnectionInfo {
  host: string;
  port: string;
  raftPort: string;
  url: string;
}

export class ClickHouseKeeperService extends DockerService {
  readonly port?: number;
  readonly volume?: string;
  protected override readonly serviceType = "clickhouse-keeper";

  constructor(config: ClickHouseKeeperServiceConfig) {
    super({
      ...config,
      image: config.image ?? "clickhouse/clickhouse-keeper:25.12.5",
      entrypoint: "/usr/bin/clickhouse-keeper",
      command: [`--config-file=${KEEPER_CONFIG_PATH}`],
      healthCheck: config.healthCheck ?? {
        command: `clickhouse-keeper-client -h localhost -p ${KEEPER_CLIENT_PORT} -q ls`,
        interval: "30s",
        timeout: "10s",
        retries: 3,
        startPeriod: "40s",
      },
    });

    this.port = config.port;
    this.volume = config.volume;
  }

  override async dev() {
    await this.writeLocalConfig("local");
    await super.dev();
  }

  override async deploy(stage: string) {
    if (this.host != null) {
      await this.writeRemoteRuntimeFile(stage, this.configRelativePath, this.getConfig(stage), {
        mode: 0o644,
      });
    } else {
      await this.writeLocalConfig(stage);
    }
    await super.deploy(stage);
  }

  override async getEnvironmentVariables(
    stage: string,
    target: ServiceEnvironmentTarget = "container",
  ): Promise<Record<string, string>> {
    const connection = this.getConnectionInfo(stage, target);
    const prefix = this.parameterizedEnvVarName("CLICKHOUSE_KEEPER");
    return {
      [`${prefix}_HOST`]: connection.host,
      [`${prefix}_PORT`]: connection.port,
      [`${prefix}_URL`]: connection.url,
    };
  }

  getConnectionInfo(
    stage: string,
    target: ServiceEnvironmentTarget = "host",
  ): ClickHouseKeeperConnectionInfo {
    const host =
      target === "container"
        ? this.getContainerName(stage)
        : stage === "local" || this.host == null
          ? "localhost"
          : this.host.address;
    const port = target === "container" ? KEEPER_CLIENT_PORT : (this.port ?? KEEPER_CLIENT_PORT);

    return {
      host,
      port: String(port),
      raftPort: String(KEEPER_RAFT_PORT),
      url: `tcp://${host}:${port}`,
    };
  }

  protected override async getDockerRunConfig(stage: string, deploy: boolean) {
    const config = await super.getDockerRunConfig(stage, deploy);
    return {
      ...config,
      volumes: [
        `${this.getVolumeName(stage)}:${KEEPER_DATA_PATH}`,
        `${this.getConfigFilePath(stage)}:${KEEPER_CONFIG_PATH}:ro`,
      ],
      ports:
        deploy && this.port == null
          ? []
          : [`${this.port ?? KEEPER_CLIENT_PORT}:${KEEPER_CLIENT_PORT}`],
    } satisfies DockerRunConfig;
  }

  protected override async getContainerRuntimeFiles(
    stage: string,
  ): Promise<readonly ContainerRuntimeFile[]> {
    return [{ path: KEEPER_CONFIG_PATH, contents: this.getConfig(stage) }];
  }

  private get configRelativePath() {
    return `${this.name}/keeper.yaml`;
  }

  private getVolumeName(stage: string) {
    return this.volume ?? `${stage}-${this.name}-data`;
  }

  private getConfigFilePath(stage: string) {
    if (stage !== "local" && this.host != null) {
      return path.posix.join(this.getAppDirectory(stage), this.configRelativePath);
    }
    return path.resolve(".saws", "runtime", stage, this.configRelativePath);
  }

  private async writeLocalConfig(stage: string) {
    const configPath = this.getConfigFilePath(stage);
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, this.getConfig(stage), { mode: 0o644 });
  }

  private getConfig(stage: string) {
    return `keeper_server:
  coordination_settings:
    force_sync: false
    operation_timeout_ms: 10000
    raft_logs_level: warning
    session_timeout_ms: 30000
    snapshot_distance: 100000
    snapshots_to_keep: 3
  four_letter_word_white_list: '*'
  log_storage_path: /var/lib/clickhouse-keeper/coordination/log
  raft_configuration:
    server:
    - hostname: ${this.getContainerName(stage)}
      id: 0
      port: ${KEEPER_RAFT_PORT}
  server_id: 0
  snapshot_storage_path: /var/lib/clickhouse-keeper/coordination/snapshots
  tcp_port: ${KEEPER_CLIENT_PORT}
listen_host: 0.0.0.0
logger:
  console: true
  level: information
`;
  }
}

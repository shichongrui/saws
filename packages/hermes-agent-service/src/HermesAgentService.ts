import type { SecretReference, ServiceEnvironmentTarget } from "@saws/core";
import {
  DockerService,
  type DockerRunConfig,
  type DockerServiceConfig,
} from "@saws/docker-service";

const HERMES_DATA_DIRECTORY = "/opt/data";
const HERMES_API_PORT = 8642;
const HERMES_DASHBOARD_PORT = 9119;

export interface HermesApiServerConfig {
  /** Bearer token required by Hermes for non-loopback API access. Must be at least 8 characters. */
  key: string | SecretReference;
  /** Host and container port for the OpenAI-compatible API. Defaults to 8642. */
  port?: number;
  /** Comma-separated browser origins allowed to call the API. Disabled when omitted. */
  corsOrigins?: string;
}

export interface HermesDashboardConfig {
  /** Host and container port for the Hermes dashboard. Defaults to 9119. */
  port?: number;
}

export interface HermesAgentServiceConfig extends Omit<
  DockerServiceConfig,
  "image" | "dockerfile" | "buildContext" | "volumes" | "ports" | "command"
> {
  /** Official Hermes Agent image. Defaults to nousresearch/hermes-agent:latest. */
  image?: string;
  /** Override the Docker volume used for Hermes configuration, memory, sessions, and skills. */
  volume?: string;
  /** Enable and expose Hermes's OpenAI-compatible API server. */
  apiServer?: HermesApiServerConfig;
  /** Enable and expose the dashboard. Configure a supported auth provider through environment. */
  dashboard?: HermesDashboardConfig;
  /** Allow Hermes tools to control the host Docker daemon. Disabled by default. */
  mountDockerSocket?: boolean;
}

export interface HermesConnectionInfo {
  host: string;
  port: string;
  url: string;
}

export class HermesAgentService extends DockerService {
  readonly volume?: string;
  readonly apiServer?: Readonly<HermesApiServerConfig>;
  readonly dashboard?: Readonly<HermesDashboardConfig>;
  readonly mountDockerSocket: boolean;
  protected override readonly serviceType = "hermes-agent";

  constructor(config: HermesAgentServiceConfig) {
    validateApiServer(config.name, config.apiServer);
    validatePort(config.apiServer?.port, "Hermes API port");
    validatePort(config.dashboard?.port, "Hermes dashboard port");

    super({
      ...config,
      image: config.image ?? "nousresearch/hermes-agent:latest",
      command: ["gateway", "run"],
      healthCheck: config.healthCheck ?? {
        command: "hermes gateway status",
        interval: "30s",
        timeout: "10s",
        retries: 5,
        startPeriod: "30s",
      },
    });

    this.volume = config.volume;
    this.apiServer = config.apiServer;
    this.dashboard = config.dashboard;
    this.mountDockerSocket = config.mountDockerSocket ?? false;
  }

  override async getEnvironmentVariables(
    stage: string,
    target: ServiceEnvironmentTarget = "container",
  ): Promise<Record<string, string>> {
    const prefix = this.parameterizedEnvVarName("HERMES");
    const api = this.getApiConnectionInfo(stage, target);
    const dashboard = this.getDashboardConnectionInfo(stage, target);

    return {
      ...(api == null
        ? {}
        : {
            [`${prefix}_API_URL`]: api.url,
            [`${prefix}_API_KEY`]: await this.resolveApiKey(stage),
          }),
      ...(dashboard == null ? {} : { [`${prefix}_DASHBOARD_URL`]: dashboard.url }),
    };
  }

  getApiConnectionInfo(
    stage: string,
    target: ServiceEnvironmentTarget = "host",
  ): HermesConnectionInfo | undefined {
    if (this.apiServer == null) return undefined;
    return this.getConnectionInfo(stage, target, this.apiServer.port ?? HERMES_API_PORT);
  }

  getDashboardConnectionInfo(
    stage: string,
    target: ServiceEnvironmentTarget = "host",
  ): HermesConnectionInfo | undefined {
    if (this.dashboard == null) return undefined;
    return this.getConnectionInfo(stage, target, this.dashboard.port ?? HERMES_DASHBOARD_PORT);
  }

  protected override async getContainerEnvironment(stage: string): Promise<Record<string, string>> {
    const apiPort = this.apiServer?.port ?? HERMES_API_PORT;
    const dashboardPort = this.dashboard?.port ?? HERMES_DASHBOARD_PORT;

    return {
      ...(await super.getContainerEnvironment(stage)),
      ...(this.apiServer == null
        ? {}
        : {
            API_SERVER_ENABLED: "true",
            API_SERVER_HOST: "0.0.0.0",
            API_SERVER_PORT: String(apiPort),
            API_SERVER_KEY: await this.resolveApiKey(stage),
            ...(this.apiServer.corsOrigins == null
              ? {}
              : { API_SERVER_CORS_ORIGINS: this.apiServer.corsOrigins }),
          }),
      ...(this.dashboard == null
        ? {}
        : {
            HERMES_DASHBOARD: "1",
            HERMES_DASHBOARD_HOST: "0.0.0.0",
            HERMES_DASHBOARD_PORT: String(dashboardPort),
          }),
    };
  }

  protected override async getDockerRunConfig(stage: string, deploy: boolean) {
    const config = await super.getDockerRunConfig(stage, deploy);
    const ports = [
      ...(this.apiServer == null
        ? []
        : [`${this.apiServer.port ?? HERMES_API_PORT}:${this.apiServer.port ?? HERMES_API_PORT}`]),
      ...(this.dashboard == null
        ? []
        : [
            `${this.dashboard.port ?? HERMES_DASHBOARD_PORT}:${this.dashboard.port ?? HERMES_DASHBOARD_PORT}`,
          ]),
    ];
    const volumes = [
      `${this.getVolumeName(stage)}:${HERMES_DATA_DIRECTORY}`,
      ...(this.mountDockerSocket ? ["/var/run/docker.sock:/var/run/docker.sock"] : []),
    ];

    return {
      ...config,
      ports,
      volumes,
    } satisfies DockerRunConfig;
  }

  protected override async onContainerStarted(stage: string) {
    const api = this.getApiConnectionInfo(stage);
    const dashboard = this.getDashboardConnectionInfo(stage);
    await this.setOutputs(
      {
        ...(api == null ? {} : { apiUrl: api.url }),
        ...(dashboard == null ? {} : { dashboardUrl: dashboard.url }),
      },
      stage,
    );
  }

  private getConnectionInfo(
    stage: string,
    target: ServiceEnvironmentTarget,
    port: number,
  ): HermesConnectionInfo {
    const host =
      target === "container"
        ? this.getContainerName(stage)
        : stage === "local" || this.host == null
          ? "localhost"
          : this.host.address;

    return { host, port: String(port), url: `http://${host}:${port}` };
  }

  private getVolumeName(stage: string) {
    return this.volume ?? `${stage}-${this.name}-hermes-data`;
  }

  private async resolveApiKey(stage: string) {
    if (this.apiServer == null) {
      throw new Error(`Hermes service "${this.name}" does not enable its API server`);
    }
    const key =
      typeof this.apiServer.key === "string"
        ? this.apiServer.key
        : await this.apiServer.key.resolve({ stage });
    if (key.length < 8) {
      throw new Error(`Hermes service "${this.name}" API key must be at least 8 characters`);
    }
    return key;
  }
}

function validateApiServer(name: string, apiServer: HermesApiServerConfig | undefined) {
  if (apiServer != null && typeof apiServer.key === "string" && apiServer.key.length < 8) {
    throw new Error(`Hermes service "${name}" API key must be at least 8 characters`);
  }
}

function validatePort(port: number | undefined, label: string) {
  if (port != null && (!Number.isInteger(port) || port < 1 || port > 65_535)) {
    throw new Error(`${label} must be a valid TCP port`);
  }
}

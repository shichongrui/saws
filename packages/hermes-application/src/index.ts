import { ServiceDefinition, type Host, type StageEnvironmentVariables } from "@saws/core";
import {
  HermesAgentService,
  type HermesApiServerConfig,
  type HermesDashboardConfig,
} from "@saws/hermes-agent-service";

export interface HermesApplicationConfig {
  /** Host where Hermes Agent is deployed. */
  host: Host;
  /** Prefix for service, network, and volume names. Defaults to "hermes". */
  name?: string;
  /** Docker network base name. Defaults to the application name. */
  network?: string;
  /** Remote SAWS application directory. Defaults to DockerService's /opt/saws. */
  appDirectory?: string;
  /** Official Hermes Agent image. Defaults to nousresearch/hermes-agent:latest. */
  image?: string;
  /** Override the Docker volume used for persistent Hermes state. */
  volume?: string;
  /** Enable and expose Hermes's OpenAI-compatible API server. */
  apiServer?: HermesApiServerConfig;
  /** Enable and expose the dashboard. Dashboard authentication is configured through environment. */
  dashboard?: HermesDashboardConfig;
  /** Stage-specific provider keys, messaging credentials, model settings, and dashboard auth. */
  environment?: StageEnvironmentVariables;
  /** Allow Hermes tools to control the host Docker daemon. Disabled by default. */
  mountDockerSocket?: boolean;
}

export interface HermesApplicationServices {
  root: ServiceDefinition;
  hermes: HermesAgentService;
}

export function createHermesServices(config: HermesApplicationConfig): HermesApplicationServices {
  const name = config.name ?? "hermes";
  const hermes = new HermesAgentService({
    name,
    host: config.host,
    network: config.network ?? name,
    appDirectory: config.appDirectory,
    image: config.image,
    volume: config.volume,
    apiServer: config.apiServer,
    dashboard: config.dashboard,
    environment: config.environment,
    mountDockerSocket: config.mountDockerSocket,
  });
  const root = new ServiceDefinition({
    name: `${name}-application`,
    dependencies: [hermes],
  });

  return { root, hermes };
}

/** Factory consumed by `saws app install`. */
export function create(config: HermesApplicationConfig) {
  return createHermesServices(config).root;
}

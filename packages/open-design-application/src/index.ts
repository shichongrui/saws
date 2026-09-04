import {
  ServiceDefinition,
  type Host,
  type SecretReference,
  type StageEnvironmentVariables,
} from "@saws/core";
import type { DockerRegistryAuthConfig } from "@saws/docker-service";
import {
  OpenDesignService,
  type OpenDesignAuthenticationRequirement,
} from "@saws/open-design-service";

export interface OpenDesignApplicationConfig {
  /** Host where OpenDesign is deployed. */
  host: Host;
  /** Service, network, and default volume prefix. Defaults to "open-design". */
  name?: string;
  /** Docker network base name. Defaults to the application name. */
  network?: string;
  /** Remote SAWS application directory. Defaults to DockerService's /opt/saws. */
  appDirectory?: string;
  /** Registry required when SAWS builds for a remote host. */
  registry?: string;
  /** Optional registry authentication. Prefer a secret reference for the password. */
  registryAuth?: DockerRegistryAuthConfig;
  /** Prebuilt SAWS OpenDesign image. When omitted, the package's derived image is built. */
  image?: string;
  /** Pinned OpenDesign base image used for derived builds. */
  baseOpenDesignImage?: string;
  /** Public gateway port. Defaults to 7456. */
  port?: number;
  /** Required password for the authenticated gateway. Prefer a stage-scoped secret. */
  setupPassword: string | SecretReference;
  /** Required agent authentication. Defaults to "any". */
  authenticationRequirement?: OpenDesignAuthenticationRequirement;
  /** Exact public origins allowed to use OpenDesign. */
  allowedOrigins?: string | readonly string[];
  openDesignVolume?: string;
  agentHomeVolume?: string;
  workspaceMount?: string;
  workspacePath?: string;
  codexVersion?: string;
  claudeCodeVersion?: string;
  /** Additional stage-specific OpenDesign or agent runtime environment. */
  environment?: StageEnvironmentVariables;
}

export interface OpenDesignApplicationServices {
  root: ServiceDefinition;
  openDesign: OpenDesignService;
}

export function createOpenDesignServices(
  config: OpenDesignApplicationConfig,
): OpenDesignApplicationServices {
  const name = config.name ?? "open-design";
  const openDesign = new OpenDesignService({
    name,
    host: config.host,
    network: config.network ?? name,
    appDirectory: config.appDirectory,
    registry: config.registry,
    auth: config.registryAuth,
    image: config.image,
    baseOpenDesignImage: config.baseOpenDesignImage,
    port: config.port,
    setupPassword: config.setupPassword,
    authenticationRequirement: config.authenticationRequirement,
    allowedOrigins: config.allowedOrigins,
    openDesignVolume: config.openDesignVolume,
    agentHomeVolume: config.agentHomeVolume,
    workspaceMount: config.workspaceMount,
    workspacePath: config.workspacePath,
    codexVersion: config.codexVersion,
    claudeCodeVersion: config.claudeCodeVersion,
    environment: config.environment,
  });
  const root = new ServiceDefinition({
    name: `${name}-application`,
    dependencies: [openDesign],
  });
  return { root, openDesign };
}

/** Factory consumed by `saws app install`. */
export function create(config: OpenDesignApplicationConfig) {
  return createOpenDesignServices(config).root;
}

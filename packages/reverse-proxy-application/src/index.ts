import { ServiceDefinition, type Host } from "@saws/core";
import { ReverseProxyService, type ReverseProxyRoute } from "@saws/reverse-proxy-service";

export interface ReverseProxyApplicationConfig {
  /** Public host where the reverse proxy is deployed. */
  host: Host;
  /** Service, network, and default volume prefix. Defaults to "reverse-proxy". */
  name?: string;
  /** Public routes served by the proxy. */
  routes: readonly ReverseProxyRoute[];
  /** Docker network base name. Defaults to the application name. */
  network?: string;
  /** Remote SAWS application directory. Defaults to DockerService's /opt/saws. */
  appDirectory?: string;
  /** Caddy image. Defaults to the version pinned by the service package. */
  image?: string;
  /** Email used for ACME certificate-expiration notices. */
  acmeEmail?: string;
  /** Host port mapped to HTTP. Defaults to 80. */
  httpPort?: number;
  /** Host port mapped to HTTPS. Defaults to 443. */
  httpsPort?: number;
  dataVolume?: string;
  configVolume?: string;
}

export interface ReverseProxyApplicationServices {
  root: ServiceDefinition;
  proxy: ReverseProxyService;
}

export function createReverseProxyServices(
  config: ReverseProxyApplicationConfig,
): ReverseProxyApplicationServices {
  const name = config.name ?? "reverse-proxy";
  const proxy = new ReverseProxyService({
    name,
    host: config.host,
    routes: config.routes,
    network: config.network ?? name,
    appDirectory: config.appDirectory,
    image: config.image,
    acmeEmail: config.acmeEmail,
    httpPort: config.httpPort,
    httpsPort: config.httpsPort,
    dataVolume: config.dataVolume,
    configVolume: config.configVolume,
  });
  const root = new ServiceDefinition({
    name: `${name}-application`,
    dependencies: [proxy],
  });
  return { root, proxy };
}

/** Factory consumed by `saws app install`. */
export function create(config: ReverseProxyApplicationConfig) {
  return createReverseProxyServices(config).root;
}

export type { ReverseProxyRoute } from "@saws/reverse-proxy-service";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  DockerService,
  type ContainerRuntimeFile,
  type DockerRunConfig,
  type DockerServiceConfig,
} from "@saws/docker-service";

const CADDYFILE_PATH = "/etc/caddy/Caddyfile";
const CADDY_DATA_PATH = "/data";
const CADDY_CONFIG_PATH = "/config";
const CADDY_HTTP_PORT = 80;
const CADDY_HTTPS_PORT = 443;

export type ReverseProxyUpstream = string | number;

export interface ReverseProxyRouteOptions {
  /** Optional active-health-check path shared by all upstreams in this route. */
  healthUri?: string;
  /** How long Caddy should retry another available upstream after a failed dial. */
  lbTryDuration?: string;
}

export interface ReverseProxyMachineRoute extends ReverseProxyRouteOptions {
  /** Public hostname accepted by the proxy. */
  hostname: string;
  /** Port on the machine running the proxy container. */
  port: number;
}

export interface ReverseProxyUpstreamRoute extends ReverseProxyRouteOptions {
  /** Public site address, such as example.com or http://example.com. */
  from: string;
  /**
   * A port on the proxy machine, an HTTP(S) upstream, or multiple load-balanced upstreams.
   * For example, `3000` targets port 3000 on the machine running Docker.
   */
  to: ReverseProxyUpstream | readonly ReverseProxyUpstream[];
}

export type ReverseProxyRoute = ReverseProxyMachineRoute | ReverseProxyUpstreamRoute;

export interface ReverseProxyServiceConfig extends Omit<
  DockerServiceConfig,
  "dockerfile" | "buildContext" | "volumes" | "ports" | "entrypoint" | "command"
> {
  /** Routes written to the generated Caddyfile. At least one route is required. */
  routes: readonly ReverseProxyRoute[];
  /** Caddy image. Defaults to the pinned official Alpine image. */
  image?: string;
  /** Email used for ACME certificate-expiration notices. */
  acmeEmail?: string;
  /** Host port mapped to Caddy's HTTP listener. Defaults to 80. */
  httpPort?: number;
  /** Host port mapped to Caddy's HTTPS listener. Defaults to 443. */
  httpsPort?: number;
  /** Persistent Docker volume for certificates and other Caddy state. */
  dataVolume?: string;
  /** Persistent Docker volume for Caddy's runtime configuration. */
  configVolume?: string;
}

/** A Caddy-backed reverse proxy with automatic HTTPS and persisted certificates. */
export class ReverseProxyService extends DockerService {
  readonly routes: readonly ReverseProxyRoute[];
  readonly acmeEmail?: string;
  readonly httpPort: number;
  readonly httpsPort: number;
  readonly dataVolume?: string;
  readonly configVolume?: string;
  protected override readonly serviceType = "reverse-proxy";

  constructor(config: ReverseProxyServiceConfig) {
    validateRoutes(config.routes);
    validatePort(config.httpPort ?? CADDY_HTTP_PORT, "httpPort");
    validatePort(config.httpsPort ?? CADDY_HTTPS_PORT, "httpsPort");
    if (config.acmeEmail != null) validateSingleLineToken(config.acmeEmail, "acmeEmail");

    super({
      ...config,
      image: config.image ?? "caddy:2.11.4-alpine",
      healthCheck: config.healthCheck ?? {
        command: "wget --spider -q http://localhost:2019/config/",
        interval: "15s",
        timeout: "5s",
        retries: 5,
        startPeriod: "5s",
      },
    });

    this.routes = config.routes;
    this.acmeEmail = config.acmeEmail;
    this.httpPort = config.httpPort ?? CADDY_HTTP_PORT;
    this.httpsPort = config.httpsPort ?? CADDY_HTTPS_PORT;
    this.dataVolume = config.dataVolume;
    this.configVolume = config.configVolume;
  }

  override async dev() {
    await this.writeLocalConfig("local");
    await super.dev();
  }

  override async deploy(stage: string) {
    if (this.host != null) {
      await this.writeRemoteRuntimeFile(stage, this.configRelativePath, this.getCaddyfile(), {
        mode: 0o644,
      });
    } else {
      await this.writeLocalConfig(stage);
    }
    await super.deploy(stage);
  }

  protected override async getDockerRunConfig(stage: string, deploy: boolean) {
    const config = await super.getDockerRunConfig(stage, deploy);
    const needsHostGateway = this.routes.some((route) =>
      getRouteUpstreams(route).some((upstream) => typeof upstream === "number"),
    );
    return {
      ...config,
      volumes: [
        `${this.getDataVolume(stage)}:${CADDY_DATA_PATH}`,
        `${this.getConfigVolume(stage)}:${CADDY_CONFIG_PATH}`,
        `${this.getConfigFilePath(stage)}:${CADDYFILE_PATH}:ro`,
      ],
      ports: [`${this.httpPort}:${CADDY_HTTP_PORT}`, `${this.httpsPort}:${CADDY_HTTPS_PORT}`],
      extraHosts: [
        ...(config.extraHosts ?? []),
        ...(needsHostGateway ? ["host.docker.internal:host-gateway"] : []),
      ],
    } satisfies DockerRunConfig;
  }

  protected override async getContainerRuntimeFiles(): Promise<readonly ContainerRuntimeFile[]> {
    return [{ path: CADDYFILE_PATH, contents: this.getCaddyfile() }];
  }

  private get configRelativePath() {
    return `${this.name}/Caddyfile`;
  }

  private getDataVolume(stage: string) {
    return this.dataVolume ?? `${stage}-${this.name}-caddy-data`;
  }

  private getConfigVolume(stage: string) {
    return this.configVolume ?? `${stage}-${this.name}-caddy-config`;
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
    await writeFile(configPath, this.getCaddyfile(), { mode: 0o644 });
  }

  private getCaddyfile() {
    const globalOptions = this.acmeEmail == null ? "" : `{\n\temail ${this.acmeEmail}\n}\n\n`;
    const sites = this.routes
      .map((route) => {
        const upstreams = getRouteUpstreams(route).map((upstream) =>
          typeof upstream === "number" ? `host.docker.internal:${upstream}` : upstream,
        );
        const options = [
          ...(route.healthUri == null ? [] : [`\t\thealth_uri ${route.healthUri}`]),
          ...(route.lbTryDuration == null ? [] : [`\t\tlb_try_duration ${route.lbTryDuration}`]),
        ];
        const reverseProxy =
          options.length === 0
            ? `\treverse_proxy ${upstreams.join(" ")}`
            : `\treverse_proxy ${upstreams.join(" ")} {\n${options.join("\n")}\n\t}`;
        return `${getRouteAddress(route)} {\n${reverseProxy}\n}`;
      })
      .join("\n\n");
    return `${globalOptions}${sites}\n`;
  }
}

function validateRoutes(routes: readonly ReverseProxyRoute[]) {
  if (routes.length === 0) throw new Error("Reverse proxy service requires at least one route");

  const siteAddresses = new Set<string>();
  for (const route of routes) {
    const address = getRouteAddress(route);
    validateSingleLineToken(address, "route hostname");
    if (siteAddresses.has(address)) {
      throw new Error(`Reverse proxy route for ${JSON.stringify(address)} is duplicated`);
    }
    siteAddresses.add(address);

    const upstreams = getRouteUpstreams(route);
    if (upstreams.length === 0) {
      throw new Error(`Reverse proxy route ${JSON.stringify(address)} requires an upstream`);
    }
    for (const upstream of upstreams) {
      if (typeof upstream === "number") validatePort(upstream, "route.to");
      else validateSingleLineToken(upstream, "route.to");
    }

    if (route.healthUri != null) {
      validateSingleLineToken(route.healthUri, "route.healthUri");
      if (!route.healthUri.startsWith("/")) {
        throw new Error("Reverse proxy route healthUri must start with /");
      }
    }
    if (route.lbTryDuration != null) {
      validateSingleLineToken(route.lbTryDuration, "route.lbTryDuration");
    }
  }
}

function getRouteUpstreams(route: ReverseProxyRoute): readonly ReverseProxyUpstream[] {
  if ("hostname" in route) return [route.port];
  return Array.isArray(route.to) ? route.to : [route.to as ReverseProxyUpstream];
}

function getRouteAddress(route: ReverseProxyRoute) {
  return "hostname" in route ? route.hostname : route.from;
}

function validateSingleLineToken(value: string, field: string) {
  if (value.length === 0 || /[\s{}]/.test(value)) {
    throw new Error(`${field} must be a nonempty Caddyfile token without whitespace or braces`);
  }
}

function validatePort(port: number, field: string) {
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${field} must be a valid TCP port`);
  }
}

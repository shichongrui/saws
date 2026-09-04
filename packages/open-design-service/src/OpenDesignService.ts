import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SecretReference, ServiceEnvironmentTarget } from "@saws/core";
import {
  DockerService,
  type DockerRunConfig,
  type DockerServiceConfig,
} from "@saws/docker-service";

const GATEWAY_PORT = 7456;
const OPEN_DESIGN_INTERNAL_PORT = 17_456;
const OPEN_DESIGN_DATA_DIRECTORY = "/app/.od";
const AGENT_HOME_DIRECTORY = "/agent-home";
const DEFAULT_WORKSPACE_DIRECTORY = "/workspace";
const DEFAULT_OPEN_DESIGN_IMAGE = "ghcr.io/nexu-io/od:0.21.0";
const DEFAULT_CODEX_VERSION = "0.151.0";
const DEFAULT_CLAUDE_CODE_VERSION = "2.1.252";

export type OpenDesignAuthenticationRequirement = "any" | "codex" | "claude" | "all";

export interface OpenDesignServiceConfig extends Omit<
  DockerServiceConfig,
  | "image"
  | "dockerfile"
  | "buildContext"
  | "volumes"
  | "ports"
  | "command"
  | "entrypoint"
  | "readOnly"
  | "tmpfs"
  | "securityOptions"
  | "memory"
  | "pidsLimit"
> {
  /** A prebuilt image containing the SAWS gateway and both agent CLIs. */
  image?: string;
  /** OpenDesign image used as the derived image base. Defaults to the pinned 0.21.0 release. */
  baseOpenDesignImage?: string;
  /** Public host port for the authenticated gateway. Defaults to 7456. */
  port?: number;
  /** Setup/application password. Prefer a stage-scoped SecretsManager reference. */
  setupPassword: string | SecretReference;
  /** Agent authentication required before OpenDesign is proxied. Defaults to "any". */
  authenticationRequirement?: OpenDesignAuthenticationRequirement;
  /** Browser origins accepted by OpenDesign, as a string or list. */
  allowedOrigins?: string | readonly string[];
  /** Persistent volume for OpenDesign state. */
  openDesignVolume?: string;
  /** Persistent volume for Codex and Claude credentials and configuration. */
  agentHomeVolume?: string;
  /** Docker volume name or host path mounted as the agent workspace. */
  workspaceMount?: string;
  /** Absolute workspace path inside the container. Defaults to /workspace. */
  workspacePath?: string;
  /** Pinned Codex CLI npm version used by the bundled image. */
  codexVersion?: string;
  /** Pinned Claude Code npm version used by the bundled image. */
  claudeCodeVersion?: string;
}

export interface OpenDesignConnectionInfo {
  host: string;
  port: string;
  url: string;
}

export class OpenDesignService extends DockerService {
  readonly port: number;
  readonly baseOpenDesignImage: string;
  readonly authenticationRequirement: OpenDesignAuthenticationRequirement;
  readonly allowedOrigins?: string;
  readonly openDesignVolume?: string;
  readonly agentHomeVolume?: string;
  readonly workspaceMount?: string;
  readonly workspacePath: string;
  readonly codexVersion: string;
  readonly claudeCodeVersion: string;
  private readonly setupPassword: string | SecretReference;
  protected override readonly serviceType = "open-design";

  constructor(config: OpenDesignServiceConfig) {
    const port = config.port ?? GATEWAY_PORT;
    const workspacePath = config.workspacePath ?? DEFAULT_WORKSPACE_DIRECTORY;
    validatePort(port);
    validateWorkspacePath(workspacePath);
    validatePassword(config.name, config.setupPassword);
    const authenticationRequirement = config.authenticationRequirement ?? "any";
    const assetDirectory = fileURLToPath(new URL("../assets", import.meta.url));

    super({
      ...config,
      ...(config.image == null
        ? {
            dockerfile: path.join(assetDirectory, "Dockerfile"),
            buildContext: assetDirectory,
          }
        : { image: config.image }),
      command: ["node", "/opt/saws-open-design-gateway/server.mjs"],
      readOnly: true,
      tmpfs: ["/tmp:rw,noexec,nosuid,size=64m"],
      securityOptions: ["no-new-privileges:true"],
      memory: "384m",
      pidsLimit: 256,
      healthCheck: config.healthCheck ?? {
        command: `node -e "fetch('http://127.0.0.1:${GATEWAY_PORT}/__saws/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"`,
        interval: "30s",
        timeout: "5s",
        retries: 3,
        startPeriod: "20s",
      },
    });

    this.port = port;
    this.baseOpenDesignImage = config.baseOpenDesignImage ?? DEFAULT_OPEN_DESIGN_IMAGE;
    this.setupPassword = config.setupPassword;
    this.authenticationRequirement = authenticationRequirement;
    this.allowedOrigins =
      typeof config.allowedOrigins === "string"
        ? config.allowedOrigins
        : config.allowedOrigins?.join(",");
    this.openDesignVolume = config.openDesignVolume;
    this.agentHomeVolume = config.agentHomeVolume;
    this.workspaceMount = config.workspaceMount;
    this.workspacePath = workspacePath;
    this.codexVersion = config.codexVersion ?? DEFAULT_CODEX_VERSION;
    this.claudeCodeVersion = config.claudeCodeVersion ?? DEFAULT_CLAUDE_CODE_VERSION;
  }

  getConnectionInfo(
    stage: string,
    target: ServiceEnvironmentTarget = "host",
  ): OpenDesignConnectionInfo {
    const host =
      target === "container"
        ? this.getContainerName(stage)
        : stage === "local" || this.host == null
          ? "localhost"
          : this.host.address;
    const port = target === "container" ? GATEWAY_PORT : this.port;
    return { host, port: String(port), url: `http://${host}:${port}` };
  }

  override async getEnvironmentVariables(
    stage: string,
    target: ServiceEnvironmentTarget = "container",
  ): Promise<Record<string, string>> {
    const prefix = this.parameterizedEnvVarName("OPEN_DESIGN");
    return { [`${prefix}_URL`]: this.getConnectionInfo(stage, target).url };
  }

  protected override async getDockerBuildArgs(): Promise<Record<string, string>> {
    return {
      OPEN_DESIGN_IMAGE: this.baseOpenDesignImage,
      CODEX_VERSION: this.codexVersion,
      CLAUDE_CODE_VERSION: this.claudeCodeVersion,
    };
  }

  protected override async getContainerEnvironment(stage: string): Promise<Record<string, string>> {
    return {
      ...(await super.getContainerEnvironment(stage)),
      HOME: AGENT_HOME_DIRECTORY,
      CODEX_HOME: `${AGENT_HOME_DIRECTORY}/.codex`,
      DISABLE_AUTOUPDATER: "1",
      GATEWAY_PORT: String(GATEWAY_PORT),
      GATEWAY_SETUP_PASSWORD: await this.resolveSetupPassword(stage),
      GATEWAY_AUTH_REQUIREMENT: this.authenticationRequirement,
      GATEWAY_INTERNAL_ORIGIN: `http://127.0.0.1:${OPEN_DESIGN_INTERNAL_PORT}`,
      GATEWAY_WORKSPACE: this.workspacePath,
      OD_BIND_HOST: "127.0.0.1",
      OD_PORT: String(OPEN_DESIGN_INTERNAL_PORT),
      OD_WEB_PORT: String(this.port),
      OD_DISABLE_API_AUTH: "1",
      OD_CODEX_SANDBOX: "danger-full-access",
      OD_DATA_DIR: OPEN_DESIGN_DATA_DIRECTORY,
      ...(this.allowedOrigins == null ? undefined : { OD_ALLOWED_ORIGINS: this.allowedOrigins }),
    };
  }

  protected override async getDockerRunConfig(stage: string, deploy: boolean) {
    const config = await super.getDockerRunConfig(stage, deploy);
    return {
      ...config,
      ports: [`${this.port}:${GATEWAY_PORT}`],
      volumes: [
        `${this.openDesignVolume ?? `${stage}-${this.name}-open-design-data`}:${OPEN_DESIGN_DATA_DIRECTORY}`,
        `${this.agentHomeVolume ?? `${stage}-${this.name}-agent-home`}:${AGENT_HOME_DIRECTORY}`,
        `${this.workspaceMount ?? `${stage}-${this.name}-workspace`}:${this.workspacePath}`,
      ],
    } satisfies DockerRunConfig;
  }

  protected override getContainerConfigHash(config: DockerRunConfig) {
    const environment = { ...config.env };
    if ("GATEWAY_SETUP_PASSWORD" in environment) {
      environment.GATEWAY_SETUP_PASSWORD = "[secret]";
    }
    return super.getContainerConfigHash({ ...config, env: environment });
  }

  protected override async onContainerStarted(stage: string) {
    await this.setOutputs({ url: this.getConnectionInfo(stage).url }, stage);
  }

  private async resolveSetupPassword(stage: string) {
    const password =
      typeof this.setupPassword === "string"
        ? this.setupPassword
        : await this.setupPassword.resolve({ stage });
    validatePassword(this.name, password);
    return password;
  }
}

function validatePort(port: number) {
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("OpenDesign public port must be a valid TCP port");
  }
  if (port === OPEN_DESIGN_INTERNAL_PORT) {
    throw new Error("OpenDesign public port cannot equal the private internal port");
  }
}

function validateWorkspacePath(workspacePath: string) {
  if (!path.posix.isAbsolute(workspacePath) || workspacePath === "/") {
    throw new Error("OpenDesign workspacePath must be an absolute non-root container path");
  }
  if (
    workspacePath === OPEN_DESIGN_DATA_DIRECTORY ||
    workspacePath.startsWith(`${OPEN_DESIGN_DATA_DIRECTORY}/`) ||
    workspacePath === AGENT_HOME_DIRECTORY ||
    workspacePath.startsWith(`${AGENT_HOME_DIRECTORY}/`)
  ) {
    throw new Error("OpenDesign workspacePath must not overlap persistent application state");
  }
}

function validatePassword(name: string, password: string | SecretReference) {
  if (typeof password === "string" && password.length < 12) {
    throw new Error(`OpenDesign service "${name}" setup password must be at least 12 characters`);
  }
}

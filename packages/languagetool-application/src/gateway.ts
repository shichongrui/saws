import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SecretReference, ServiceEnvironmentTarget } from "@saws/core";
import { DockerService, type DockerServiceConfig } from "@saws/docker-service";
import { LanguageToolService } from "@saws/languagetool-service";

const GATEWAY_PORT = 8081;
const SERVER_PATH = "/opt/saws-languagetool/server.mjs";

/** Application-local policy: LanguageTool is reachable only through Docker networking. */
export class PrivateLanguageToolService extends LanguageToolService {
  protected override async getDockerRunConfig(stage: string, deploy: boolean) {
    return { ...(await super.getDockerRunConfig(stage, deploy)), ports: [] };
  }

  override getConnectionInfo(stage: string, _target: ServiceEnvironmentTarget = "host") {
    return super.getConnectionInfo(stage, "container");
  }
}

interface GatewayConfig {
  name: string;
  host: DockerServiceConfig["host"];
  network: string;
  appDirectory?: string;
  port: number;
  apiKey?: string | SecretReference;
  apiKeys?: readonly (string | SecretReference)[];
  languagetool: LanguageToolService;
}

/** Internal to the application package; not a standalone service package. */
export class LanguageToolGateway extends DockerService {
  readonly port: number;
  private readonly apiKeys: readonly (string | SecretReference)[];
  private readonly languagetool: LanguageToolService;
  protected override readonly serviceType = "languagetool-gateway";

  constructor(config: GatewayConfig) {
    if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65_535) {
      throw new Error("LanguageTool gateway port must be a valid TCP port");
    }
    const apiKeys = [...(config.apiKey == null ? [] : [config.apiKey]), ...(config.apiKeys ?? [])];
    if (apiKeys.length === 0) {
      throw new Error("LanguageTool requires at least one apiKey or apiKeys entry");
    }
    for (const apiKey of apiKeys) {
      if (typeof apiKey === "string" || apiKey == null) validateApiKey(apiKey);
    }
    super({
      name: config.name,
      host: config.host,
      network: config.network,
      appDirectory: config.appDirectory,
      dependencies: [config.languagetool],
      image: "node:24-alpine",
      command: ["node", SERVER_PATH],
      readOnly: true,
      securityOptions: ["no-new-privileges:true"],
      healthCheck: {
        command: `node -e "fetch('http://127.0.0.1:${GATEWAY_PORT}/__saws/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"`,
        interval: "30s",
        timeout: "5s",
        retries: 3,
      },
    });
    this.port = config.port;
    this.apiKeys = apiKeys;
    this.languagetool = config.languagetool;
  }

  override async dev() {
    await this.writeLocalServer("local");
    await super.dev();
  }

  override async deploy(stage: string) {
    if (this.host != null) {
      await this.writeRemoteRuntimeFile(
        stage,
        this.serverRelativePath,
        await this.serverContents(),
        {
          mode: 0o644,
        },
      );
    } else {
      await this.writeLocalServer(stage);
    }
    await super.deploy(stage);
  }

  protected override async getContainerEnvironment(stage: string) {
    const apiKeys = await Promise.all(
      this.apiKeys.map(async (key) => {
        const value = typeof key === "string" ? key : await key.resolve({ stage });
        validateApiKey(value);
        return value;
      }),
    );
    return {
      ...(await super.getContainerEnvironment(stage)),
      GATEWAY_API_KEYS: JSON.stringify([...new Set(apiKeys)]),
      GATEWAY_PORT: String(GATEWAY_PORT),
      LANGUAGETOOL_URL: this.languagetool.getConnectionInfo(stage, "container").url,
    };
  }

  protected override async getDockerRunConfig(stage: string, deploy: boolean) {
    return {
      ...(await super.getDockerRunConfig(stage, deploy)),
      ports: [`${this.port}:${GATEWAY_PORT}`],
      volumes: [`${this.serverFilePath(stage)}:${SERVER_PATH}:ro`],
    };
  }

  protected override async getContainerRuntimeFiles() {
    return [{ path: SERVER_PATH, contents: await this.serverContents() }];
  }

  protected override async onContainerStarted(stage: string) {
    const host = stage === "local" || this.host == null ? "localhost" : this.host.address;
    const urlHost = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
    await this.setOutputs({ url: `http://${urlHost}:${this.port}/v2` }, stage);
  }

  private get serverRelativePath() {
    return `${this.name}/server.mjs`;
  }

  private serverFilePath(stage: string) {
    return stage !== "local" && this.host != null
      ? path.posix.join(this.getAppDirectory(stage), this.serverRelativePath)
      : path.resolve(".saws", "runtime", stage, this.serverRelativePath);
  }

  private serverContents() {
    return readFile(new URL("../assets/server.mjs", import.meta.url), "utf8");
  }

  private async writeLocalServer(stage: string) {
    const destination = this.serverFilePath(stage);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, await this.serverContents(), { mode: 0o644 });
  }
}

function validateApiKey(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[A-Za-z0-9._~+/-]+=*$/.test(value)) {
    throw new Error("LanguageTool apiKey must be a nonempty bearer token without whitespace");
  }
}

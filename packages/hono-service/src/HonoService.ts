import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ServiceDefinition, type Host } from "@saws/core";
import { installDependencies } from "@saws/core/utils/dependency-management";
import { fileExists } from "@saws/core/utils/file-exists";
import { shellQuote } from "@saws/core/utils/shell-quote";
import {
  DockerService,
  type DockerRunConfig,
  type DockerServiceConfig,
} from "@saws/docker-service";

export interface HonoServiceConfig extends Omit<
  DockerServiceConfig,
  "image" | "dockerfile" | "buildContext" | "ports" | "command" | "healthCheck"
> {
  /** Port the Hono app listens on. Defaults to PORT or 3000. */
  port?: number;
  /** Public host name routed by Traefik during remote deploys. */
  domain?: string;
}

export class HonoService extends DockerService {
  readonly port?: number;
  readonly domain?: string;
  protected override readonly serviceType = "hono";
  private honoDevProcess?: ChildProcess;

  constructor(config: HonoServiceConfig) {
    super({
      ...config,
      dockerfile: path.join(config.name, "Dockerfile"),
      buildContext: config.name,
      healthCheck: {
        command:
          "node -e \"fetch('http://localhost:${PORT:-3000}/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))\"",
        interval: "5s",
        timeout: "2s",
        retries: 12,
        startPeriod: "5s",
      },
    });
    this.port = config.port;
    this.domain = config.domain;
  }

  override async init() {
    await super.init();
    await mkdir(path.resolve(this.name, "src"), { recursive: true });
    await writeFileIfMissing(
      path.resolve(this.name, "package.json"),
      JSON.stringify({ type: "module" }, null, 2) + "\n",
    );
    await writeFileIfMissing(
      path.resolve(this.name, "tsconfig.json"),
      JSON.stringify(
        {
          extends: "@tsconfig/node26/tsconfig.json",
          compilerOptions: {
            composite: true,
            outDir: "./dist",
            rootDir: "./src",
            types: ["node"],
          },
        },
        null,
        2,
      ) + "\n",
    );
    await writeFileIfMissing(path.resolve(this.name, "src", "index.ts"), honoIndexTemplate());
    await writeFileIfMissing(path.resolve(this.name, "Dockerfile"), dockerfileTemplate());
    await addWorkspace(this.name);
    await addTsconfigReference(`./${this.name}/tsconfig.json`);
    await installDependencies(["hono", "@hono/node-server"], {
      workspace: this.name,
      logSink: this.getRuntimeLogSink(),
      serviceName: this.name,
    });
    await installDependencies(["typescript", "tsx", "@tsconfig/node26", "@types/node"], {
      workspace: this.name,
      development: true,
      logSink: this.getRuntimeLogSink(),
      serviceName: this.name,
    });
  }

  override async dev() {
    await ServiceDefinition.prototype.dev.call(this);

    const port = String(this.getPort());
    const environment = {
      ...(await this.getDependenciesEnvironmentVariables("local", "host")),
      ...(await this.getStageEnvironmentVariables("local")),
      PORT: port,
    };
    this.writeRuntimeLog(`Start Hono dev server ${this.name} on port ${port}\n`);
    this.honoDevProcess = spawn("npx", ["tsx", "watch", "src/index.ts"], {
      cwd: path.resolve(this.name),
      env: {
        ...process.env,
        ...environment,
        NODE_ENV: "development",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.observeHonoDevProcess(this.honoDevProcess);
  }

  override async deploy(stage: string) {
    await DockerService.prototype.deploy.call(this, stage);
  }

  override exit() {
    super.exit();
    this.honoDevProcess?.kill();
    this.honoDevProcess = undefined;
  }

  protected override async getContainerEnvironment(stage: string): Promise<Record<string, string>> {
    return {
      ...(await super.getContainerEnvironment(stage)),
      PORT: String(this.getPort()),
    };
  }

  protected override async getDockerRunConfig(stage: string, deploy: boolean) {
    const config = await super.getDockerRunConfig(stage, deploy);
    const port = this.getPort();

    return {
      ...config,
      ports: [`${port}:${port}`],
    } satisfies DockerRunConfig;
  }

  private getPort() {
    return this.port ?? Number(process.env["PORT"] ?? 3000);
  }

  private traefikRouterName(stage: string) {
    return `${stage}-${this.name}`.replaceAll(/[^a-zA-Z0-9-]/g, "-").toLowerCase();
  }

  private traefikServiceName(stage: string) {
    return this.traefikRouterName(stage);
  }

  private getTraefikRule() {
    if (this.domain != null) return `Host(\`${this.domain}\`)`;
    return `PathPrefix(\`/\`)`;
  }

  private async installTraefik(stage: string, host: Host) {
    await this.assertRemoteHostReady();
    await this.prepareRemote(stage, this.getNetwork(stage));
    const runTraefik = [
      "docker run -d",
      "--name saws-traefik",
      "--restart unless-stopped",
      `--network ${shellQuote(this.getNetwork(stage))}`,
      "-p 80:80",
      "-v /var/run/docker.sock:/var/run/docker.sock:ro",
      "traefik:v3.6",
      "--providers.docker=true",
      "--providers.docker.exposedbydefault=false",
      "--entrypoints.web.address=:80",
    ].join(" ");

    await host.exec(
      [
        "if ! docker inspect saws-traefik >/dev/null 2>&1; then",
        runTraefik,
        "fi",
        `docker network connect ${shellQuote(this.getNetwork(stage))} saws-traefik >/dev/null 2>&1 || true`,
      ].join("\n"),
    );
  }

  private async deployBlueGreen(stage: string, config: DockerRunConfig) {
    await this.prepareRemote(stage, config.network);
    await this.host!.exec(`docker pull ${shellQuote(config.image)}`);

    let environmentFile;
    try {
      environmentFile = await this.writeRemoteEnvironmentFile(stage, config);
      const blueConfig = this.withColor(config, "blue", true);
      const greenConfig = this.withColor(config, "green", true);
      const blueRun = this.getDockerRunCommand(this.withConfigHash(blueConfig, config), true);
      const greenRun = this.getDockerRunCommand(this.withConfigHash(greenConfig, config), true);
      await this.host!.exec(
        [
          `ACTIVE_COLOR=$(docker ps --filter label=saws.service=${shellQuote(this.name)} --filter label=saws.stage=${shellQuote(stage)} --filter label=traefik.enable=true --format '{{.Label "saws.deploymentColor"}}' | head -n 1)`,
          'if [ "$ACTIVE_COLOR" = "blue" ]; then',
          `NEXT_CONTAINER=${shellQuote(greenConfig.name)}`,
          `OLD_CONTAINER=${shellQuote(blueConfig.name)}`,
          `docker rm -f ${shellQuote(greenConfig.name)} >/dev/null 2>&1 || true`,
          greenRun,
          "else",
          `NEXT_CONTAINER=${shellQuote(blueConfig.name)}`,
          `OLD_CONTAINER=${shellQuote(greenConfig.name)}`,
          `docker rm -f ${shellQuote(blueConfig.name)} >/dev/null 2>&1 || true`,
          blueRun,
          "fi",
          this.waitForHealthyScript("$NEXT_CONTAINER"),
          'docker rm -f "$OLD_CONTAINER" >/dev/null 2>&1 || true',
        ].join("\n"),
      );
    } finally {
      if (environmentFile != null) {
        await this.removeRemoteRuntimeFile(environmentFile);
      }
    }
  }

  private withConfigHash(config: DockerRunConfig, baseConfig: DockerRunConfig) {
    return {
      ...config,
      labels: {
        ...config.labels,
        "saws.configHash": baseConfig.configHash ?? this.getContainerConfigHash(baseConfig),
      },
    };
  }

  private withColor(config: DockerRunConfig, color: "blue" | "green", enabled: boolean) {
    return {
      ...config,
      name: `${config.name}-${color}`,
      labels: {
        ...config.labels,
        "saws.deploymentColor": color,
        "traefik.enable": enabled ? "true" : "false",
      },
    } satisfies DockerRunConfig;
  }

  private waitForHealthyScript(containerNameExpression: string) {
    return [
      "for i in $(seq 1 60); do",
      `status=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}running{{end}}' ${containerNameExpression} 2>/dev/null || true)`,
      'if [ "$status" = "healthy" ] || [ "$status" = "running" ]; then break; fi',
      'if [ "$i" = "60" ]; then',
      `docker logs ${containerNameExpression} --tail 100 || true`,
      'echo "Container did not become healthy"',
      "exit 1",
      "fi",
      "sleep 1",
      "done",
    ].join("\n");
  }

  private observeHonoDevProcess(process: ChildProcess) {
    process.stdout?.on("data", (chunk: Buffer) => this.writeRuntimeLog(chunk.toString("utf8")));
    process.stderr?.on("data", (chunk: Buffer) =>
      this.writeRuntimeLog(chunk.toString("utf8"), "stderr"),
    );
    process.once("error", (error) => {
      this.writeRuntimeLog(`${error.stack ?? error.message}\n`, "stderr");
    });
    process.once("exit", (code, signal) => {
      if (this.honoDevProcess === process) this.honoDevProcess = undefined;
      if (code !== 0 && signal !== "SIGTERM" && signal !== "SIGINT") {
        this.writeRuntimeLog(
          `Hono dev server exited with code ${code ?? "unknown"}${signal == null ? "" : ` (${signal})`}\n`,
          "stderr",
        );
      }
    });
  }
}

async function writeFileIfMissing(filePath: string, contents: string) {
  if (await fileExists(filePath)) return;
  await writeFile(filePath, contents);
}

async function addWorkspace(workspace: string) {
  const packageJsonPath = path.resolve("package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
    workspaces?: string[] | { packages?: string[] };
  };

  if (Array.isArray(packageJson.workspaces)) {
    if (!packageJson.workspaces.includes(workspace)) packageJson.workspaces.push(workspace);
  } else {
    packageJson.workspaces = {
      ...packageJson.workspaces,
      packages: [...new Set([...(packageJson.workspaces?.packages ?? []), workspace])],
    };
  }

  await writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2) + "\n");
}

async function addTsconfigReference(reference: string) {
  const tsconfigPath = path.resolve("tsconfig.json");
  const tsconfig = JSON.parse(await readFile(tsconfigPath, "utf8")) as {
    references?: Array<{ path: string }>;
  };
  tsconfig.references = tsconfig.references ?? [];
  if (
    !tsconfig.references.some(
      (entry) => entry.path === reference || entry.path === `./${reference}`,
    )
  ) {
    tsconfig.references.push({ path: reference });
  }
  await writeFile(tsconfigPath, JSON.stringify(tsconfig, null, 2) + "\n");
}

function honoIndexTemplate() {
  return `import { serve } from "@hono/node-server";
import { Hono } from "hono";

const app = new Hono()
  .get("/health", (c) => c.json({ ok: true }))
  .get("/", (c) => c.text("Hello from Hono"));

export type AppType = typeof app;

const port = Number(process.env.PORT ?? 3000);

serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    console.log(\`Hono server listening on http://localhost:\${info.port}\`);
  },
);
`;
}

function dockerfileTemplate() {
  return `FROM node:26-slim AS build
WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .
RUN npx --no-install tsc -b

FROM node:26-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json ./
RUN npm install --omit=dev

COPY --from=build /app/dist ./dist

CMD ["node", "dist/index.js"]
`;
}

import { spawn, type ChildProcess } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  DeployContext,
  type DevContext,
  type InitContext,
  type RuntimeContext,
} from "@saws/core";
import type {
  EnvironmentVariables,
  EnvironmentVariableTarget,
} from "@saws/core";
import {
  DockerService,
  type DockerServiceConfig,
  type RuntimeFile,
} from "@saws/docker";

export interface HonoHTTPServiceConfig
  extends Omit<
    DockerServiceConfig,
    "image" | "dockerfile" | "buildContext"
  > {
  /** Application directory, relative to the runtime root. Defaults to the service name. */
  directory?: string;
  /** App port used locally and by the deployed proxy. */
  port?: number;
  /** HTTP path polled before switching the proxy to a new deployment. */
  healthCheckPath?: string;
  /** Seconds allowed for a new container to become ready. Defaults to 30. */
  healthCheckTimeoutSeconds?: number;
  /** Seconds allowed for old requests to drain after a proxy switch. Defaults to 30. */
  drainTimeoutSeconds?: number;
  /** Nginx image used by the deployed reverse proxy. */
  proxyImage?: string;
  /** Public URL advertised to application clients after deployment. */
  publicUrl?: string;
}

/**
 * A scaffolded Hono application that runs directly on the host in development
 * and deploys as a DockerService.
 */
export class HonoHTTPService extends DockerService {
  readonly directory: string;
  readonly port: number;
  readonly healthCheckPath: string;
  readonly healthCheckTimeoutSeconds: number;
  readonly drainTimeoutSeconds: number;
  readonly proxyImage: string;
  readonly publicUrl?: string;

  constructor(config: HonoHTTPServiceConfig) {
    const directory = config.directory ?? config.name;
    const port = config.port ?? 3000;

    super({
      ...config,
      dockerfile: path.join(directory, "Dockerfile"),
      buildContext: directory,
      ports: config.ports ?? [`${port}:${port}`],
      environment: {
        ...config.environment,
        PORT: String(port),
      },
      healthCheck: config.healthCheck ?? {
        command: honoHealthCheckCommand(port, config.healthCheckPath ?? "/"),
        interval: "10s",
        timeout: "5s",
        retries: 3,
        startPeriod: `${config.healthCheckTimeoutSeconds ?? 30}s`,
      },
    });

    this.directory = directory;
    this.port = port;
    this.healthCheckPath = config.healthCheckPath ?? "/";
    this.healthCheckTimeoutSeconds = config.healthCheckTimeoutSeconds ?? 30;
    this.drainTimeoutSeconds = config.drainTimeoutSeconds ?? 30;
    this.proxyImage = config.proxyImage ?? "nginx:1.27-alpine";
    this.publicUrl = config.publicUrl?.replace(/\/+$/, "");
  }

  protected override get serviceType() {
    return "hono-http";
  }

  protected override async onInit(context: InitContext) {
    const applicationDirectory = this.getApplicationDirectory(context);
    const packageChanged = await ensurePackageJson(
      context,
      applicationDirectory,
      this.name
    );

    await Promise.all([
      writeFileIfMissing(
        context,
        path.join(applicationDirectory, "src", "index.ts"),
        honoEntrypointTemplate()
      ),
      writeFileIfMissing(
        context,
        path.join(applicationDirectory, "tsconfig.json"),
        typescriptConfigTemplate()
      ),
      writeFileIfMissing(
        context,
        path.join(applicationDirectory, "Dockerfile"),
        dockerfileTemplate(this.port)
      ),
      writeFileIfMissing(
        context,
        path.join(applicationDirectory, ".dockerignore"),
        dockerignoreTemplate
      ),
    ]);

    if (
      packageChanged ||
      !(await fileExists(path.join(applicationDirectory, "node_modules", ".bin", "tsx")))
    ) {
      await this.installDependencies(context, applicationDirectory);
    }
  }

  protected override async onDev(context: DevContext) {
    const applicationDirectory = this.getApplicationDirectory(context);
    const environment = await this.getDevEnvironment(context);

    this.devProcess = this.startDevProcess(
      context,
      applicationDirectory,
      environment
    );
    this.observeHonoDevProcess(context, this.devProcess);
  }

  protected override async onDeploy(context: DeployContext) {
    await this.prepareImage(context);
    const app = await this.getDockerRunConfig(context);
    const proxyPorts = app.ports ?? [];
    app.ports = [];
    app.configHash = this.docker.getContainerConfigHash(app);
    let environmentFile: RuntimeFile | undefined;

    try {
      environmentFile = await this.writeDeployEnvironmentFile(context, app);
      await this.docker.runBlueGreenContainer(context, {
        app,
        appPort: this.port,
        proxyPorts,
        healthCheckPath: this.healthCheckPath,
        healthCheckTimeoutSeconds: this.healthCheckTimeoutSeconds,
        drainTimeoutSeconds: this.drainTimeoutSeconds,
        proxyImage: this.proxyImage,
      });
    } finally {
      if (environmentFile != null) {
        await this.docker.removeRuntimeFile(context, environmentFile);
      }
    }

    await this.onContainerStarted(context);
  }

  override async getEnvironmentVariables(
    context: RuntimeContext,
    target: EnvironmentVariableTarget = "host"
  ): Promise<EnvironmentVariables> {
    return {
      [honoServiceUrlEnvironmentVariable(this.name)]:
        this.getServiceUrl(context, target),
    };
  }

  protected async installDependencies(
    context: InitContext,
    applicationDirectory: string
  ) {
    if (context.dryRun) {
      context.writeLog(`[dry-run:local] npm install (cwd: ${applicationDirectory})\n`);
      return;
    }

    await runToCompletion("npm", ["install"], {
      cwd: applicationDirectory,
      env: context.env,
      context,
    });
  }

  protected startDevProcess(
    context: DevContext,
    applicationDirectory: string,
    environment: EnvironmentVariables
  ) {
    const args = ["exec", "--", "tsx", "watch", "src/index.ts"];

    if (context.dryRun) {
      context.writeLog(
        `[dry-run:local] npm ${args.join(" ")} (cwd: ${applicationDirectory})\n`
      );
      return spawn(process.execPath, ["-e", ""], { stdio: "ignore" });
    }

    const child = spawn("npm", args, {
      cwd: applicationDirectory,
      env: environment,
      stdio: context.logSink == null ? "inherit" : ["ignore", "pipe", "pipe"],
    });

    child.stdout?.on("data", (chunk: Buffer) => {
      context.writeLog(chunk.toString("utf8"), "stdout");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      context.writeLog(chunk.toString("utf8"), "stderr");
    });

    return child;
  }

  private getApplicationDirectory(context: RuntimeContext) {
    return path.resolve(context.rootDir, this.directory);
  }

  private getServiceUrl(
    context: RuntimeContext,
    target: EnvironmentVariableTarget
  ) {
    if (context instanceof DeployContext) {
      if (target === "container") {
        return `http://${this.getContainerName(context)}-proxy:${this.port}`;
      }

      if (this.publicUrl != null) return this.publicUrl;
      return httpUrl(
        this.docker.host.address,
        getPublishedHostPort(this.ports[0], this.port)
      );
    }

    return httpUrl(
      target === "container" ? "host.docker.internal" : "127.0.0.1",
      this.port
    );
  }

  private async getDevEnvironment(
    context: DevContext
  ): Promise<EnvironmentVariables> {
    return {
      ...context.env,
      ...await this.getDependenciesEnvironmentVariables(context, "host"),
      ...this.environment,
    };
  }

  private observeHonoDevProcess(context: DevContext, process: ChildProcess) {
    process.once("error", (error) => {
      context.writeLog(`${error.stack ?? error.message}\n`, "stderr");
    });
    process.once("exit", (code, signal) => {
      if (this.devProcess === process) this.devProcess = undefined;
      if (code !== 0 && signal !== "SIGTERM" && signal !== "SIGINT") {
        context.writeLog(
          `Hono development server exited with code ${code ?? "unknown"}${signal == null ? "" : ` (${signal})`}\n`,
          "stderr"
        );
      }
    });
  }
}

export function honoServiceUrlEnvironmentVariable(serviceName: string) {
  return `${serviceName.replace(/[^a-zA-Z\d]/g, "_").toUpperCase()}_URL`;
}

function getPublishedHostPort(mapping: string | undefined, fallback: number) {
  if (mapping == null) return fallback;
  const withoutProtocol = mapping.split("/", 1)[0] ?? mapping;
  const parts = withoutProtocol.split(":");
  const candidate = parts.length >= 2 ? parts.at(-2) : parts[0];
  const port = Number(candidate);
  return Number.isInteger(port) && port > 0 ? port : fallback;
}

function httpUrl(hostname: string, port: number) {
  const host = hostname.includes(":") && !hostname.startsWith("[")
    ? `[${hostname}]`
    : hostname;
  return `http://${host}${port === 80 ? "" : `:${port}`}`;
}

async function ensurePackageJson(
  context: InitContext,
  directory: string,
  serviceName: string
) {
  const packagePath = path.join(directory, "package.json");
  let packageJson: Record<string, unknown>;

  try {
    packageJson = JSON.parse(await readFile(packagePath, "utf8")) as Record<
      string,
      unknown
    >;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    packageJson = {};
  }

  const updated = {
    ...packageJson,
    name: packageJson.name ?? toPackageName(serviceName),
    private: packageJson.private ?? true,
    type: packageJson.type ?? "module",
    scripts: addMissingEntries(packageJson.scripts, {
      dev: "tsx watch src/index.ts",
      build: "tsc",
      start: "node dist/index.js",
    }),
    dependencies: addMissingEntries(packageJson.dependencies, {
      "@hono/node-server": "^1.0.0",
      hono: "^4.0.0",
    }),
    devDependencies: addMissingEntries(packageJson.devDependencies, {
      "@types/node": "^22.0.0",
      tsx: "^4.0.0",
      typescript: "^5.0.0",
    }),
  };
  const contents = `${JSON.stringify(updated, null, 2)}\n`;
  const current = await readFile(packagePath, "utf8").catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    }
  );

  if (current === contents) return false;
  if (context.dryRun) {
    context.writeLog(`[dry-run:local] write ${packagePath}\n`);
    return true;
  }

  await mkdir(directory, { recursive: true });
  await writeFile(packagePath, contents);
  return true;
}

function addMissingEntries(
  value: unknown,
  required: Record<string, string>
): Record<string, unknown> {
  const existing =
    value != null && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
  return { ...required, ...existing };
}

async function writeFileIfMissing(
  context: InitContext,
  filePath: string,
  contents: string
) {
  if (await fileExists(filePath)) return;

  if (context.dryRun) {
    context.writeLog(`[dry-run:local] write ${filePath}\n`);
    return;
  }

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents, { flag: "wx" });
}

async function fileExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function runToCompletion(
  command: string,
  args: string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    context: RuntimeContext;
  }
) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio:
        options.context.logSink == null
          ? "inherit"
          : ["ignore", "pipe", "pipe"],
    });
    child.stdout?.on("data", (chunk: Buffer) => {
      options.context.writeLog(chunk.toString("utf8"), "stdout");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      options.context.writeLog(chunk.toString("utf8"), "stderr");
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `${command} exited with code ${code ?? "unknown"}${signal == null ? "" : ` (${signal})`}`
        )
      );
    });
  });
}

function toPackageName(serviceName: string) {
  const name = serviceName
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "");
  return name.length === 0 ? "hono-service" : name;
}

function honoEntrypointTemplate() {
  return `import { serve } from "@hono/node-server";
import { Hono } from "hono";

const app = new Hono();

app.get("/", (context) => context.text("Hello Hono!"));

serve({
  fetch: app.fetch,
  port: Number(process.env.PORT ?? 3000),
});
`;
}

function typescriptConfigTemplate() {
  return `${JSON.stringify({
    compilerOptions: {
      target: "ES2022",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      rootDir: "src",
      outDir: "dist",
      strict: true,
      skipLibCheck: true,
      sourceMap: true,
    },
    include: ["src/**/*.ts"],
  }, null, 2)}\n`;
}

function dockerfileTemplate(port: number) {
  return `FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json

USER node
EXPOSE ${port}
CMD ["node", "dist/index.js"]
`;
}

function honoHealthCheckCommand(port: number, path: string) {
  const url = JSON.stringify(`http://127.0.0.1:${port}${path}`)
    .replaceAll("'", "\\u0027");
  return `node -e 'fetch(${url}).then(response => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))'`;
}

const dockerignoreTemplate = `node_modules
dist
.git
.saws
`;

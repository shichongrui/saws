import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ServiceDefinition, type ServiceEnvironmentTarget } from "@saws/core";
import { installDependencies } from "@saws/core/utils/dependency-management";
import { fileExists } from "@saws/core/utils/file-exists";
import { DockerService, type DockerServiceConfig } from "@saws/docker-service";
import { RedisService } from "@saws/redis-service";

export interface BullMQServiceConfig extends Omit<
  DockerServiceConfig,
  "image" | "dockerfile" | "buildContext" | "ports" | "command" | "healthCheck"
> {
  /** Redis instance used by this worker and its queue clients. */
  redis: RedisService;
  /** Queue name. Defaults to this service's name. */
  queue?: string;
}

export class BullMQService extends DockerService {
  readonly redis: RedisService;
  readonly queue: string;
  protected override readonly serviceType = "bullmq";
  private bullMQDevProcess?: ChildProcess;

  constructor(config: BullMQServiceConfig) {
    super({
      ...config,
      dependencies: [...(config.dependencies ?? []), config.redis],
      dockerfile: path.join(config.name, "Dockerfile"),
      buildContext: ".",
      healthCheck: false,
    });
    this.redis = config.redis;
    this.queue = config.queue ?? config.name;
  }

  override async init() {
    await super.init();
    await mkdir(path.resolve(this.name, "src", "jobs"), { recursive: true });
    await writeFileIfMissing(
      path.resolve(this.name, "package.json"),
      JSON.stringify({ name: this.name, type: "module" }, null, 2) + "\n",
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
    await writeFileIfMissing(path.resolve(this.name, "src", "index.ts"), workerIndexTemplate());
    await writeFileIfMissing(path.resolve(this.name, "Dockerfile"), dockerfileTemplate(this.name));
    await addWorkspace(this.name);
    await addTsconfigReference(`./${this.name}/tsconfig.json`);
    await installDependencies(["bullmq", "@saws/bullmq-service"], {
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

    const environment = {
      ...(await this.getDependenciesEnvironmentVariables("local", "host")),
      ...(await this.getStageEnvironmentVariables("local")),
      ...(await this.getEnvironmentVariables("local", "host")),
      REDIS_URL: (await this.redis.getConnectionInfo("local", "host")).url,
      QUEUE_NAME: this.queue,
    };
    this.writeRuntimeLog(`Start BullMQ worker ${this.name} for queue ${this.queue}\n`);
    this.bullMQDevProcess = spawn("npx", ["tsx", "watch", "src/index.ts"], {
      cwd: path.resolve(this.name),
      env: {
        ...process.env,
        ...environment,
        NODE_ENV: "development",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.observeBullMQDevProcess(this.bullMQDevProcess);
  }

  override exit() {
    super.exit();
    this.bullMQDevProcess?.kill();
    this.bullMQDevProcess = undefined;
  }

  override async getEnvironmentVariables(
    stage: string,
    target: ServiceEnvironmentTarget = "container",
  ): Promise<Record<string, string>> {
    return {
      [this.parameterizedEnvVarName("REDIS_URL")]: (
        await this.redis.getConnectionInfo(stage, target)
      ).url,
      [this.parameterizedEnvVarName("QUEUE_NAME")]: this.queue,
    };
  }

  protected override async getContainerEnvironment(stage: string): Promise<Record<string, string>> {
    return {
      ...(await super.getContainerEnvironment(stage)),
      ...(await this.getEnvironmentVariables(stage, "container")),
      REDIS_URL: (await this.redis.getConnectionInfo(stage, "container")).url,
      QUEUE_NAME: this.queue,
    };
  }

  private observeBullMQDevProcess(process: ChildProcess) {
    process.stdout?.on("data", (chunk: Buffer) => this.writeRuntimeLog(chunk.toString("utf8")));
    process.stderr?.on("data", (chunk: Buffer) =>
      this.writeRuntimeLog(chunk.toString("utf8"), "stderr"),
    );
    process.once("error", (error) => {
      this.writeRuntimeLog(`${error.stack ?? error.message}\n`, "stderr");
    });
    process.once("exit", (code, signal) => {
      if (this.bullMQDevProcess === process) this.bullMQDevProcess = undefined;
      if (code !== 0 && signal !== "SIGTERM" && signal !== "SIGINT") {
        this.writeRuntimeLog(
          `BullMQ worker exited with code ${code ?? "unknown"}${signal == null ? "" : ` (${signal})`}\n`,
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

function workerIndexTemplate() {
  return `import {
  createWorker,
  type BackgroundJobConstructor,
  type JobsFromMapping,
} from "@saws/bullmq-service";

const jobs = {
  // Register jobs here, for example: "send-email": SendEmailJob,
} satisfies Record<string, BackgroundJobConstructor>;

export type Jobs = JobsFromMapping<typeof jobs>;

createWorker(jobs);
`;
}

function dockerfileTemplate(servicePath: string) {
  const dockerServicePath = servicePath.split(path.sep).join(path.posix.sep);

  return `FROM node:26-slim AS build
WORKDIR /app

COPY package*.json ./
COPY ${dockerServicePath}/package*.json ./${dockerServicePath}/
RUN npm ci --workspace ./${dockerServicePath} --include-workspace-root=false

COPY ${dockerServicePath} ./${dockerServicePath}
RUN npx --no-install tsc -p ${dockerServicePath}/tsconfig.json

FROM node:26-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
COPY ${dockerServicePath}/package*.json ./${dockerServicePath}/
RUN npm ci --omit=dev --workspace ./${dockerServicePath} --include-workspace-root=false

COPY --from=build /app/${dockerServicePath}/dist ./${dockerServicePath}/dist

WORKDIR /app/${dockerServicePath}
CMD ["node", "dist/index.js"]
`;
}

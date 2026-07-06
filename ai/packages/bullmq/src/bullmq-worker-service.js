import { spawn } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { DeployContext, } from "@saws/core";
import { DockerService, } from "@saws/docker";
import { serializeEnvironment } from "./environment.js";
/**
 * A BullMQ worker and its one-to-one queue, deployed as a Docker service.
 *
 * `init` scaffolds the queue, worker, jobs registry, package.json, Dockerfile
 * and supporting files. Development runs the worker locally with `tsx watch`;
 * deployment builds the image and runs a container on every provided host.
 *
 * A BullMQClient parameterized over the scaffolded `JobRegistry` type can
 * enqueue jobs onto this service's queue from any other SAWS service.
 */
export class BullMQWorkerService extends DockerService {
    directory;
    providers;
    redis;
    queueName;
    queueNamePrefix;
    concurrency;
    jobsModule;
    packageDependencies;
    packageDevDependencies;
    constructor(config) {
        const directory = config.directory ?? config.name;
        const providers = Array.isArray(config.docker) ? config.docker : [config.docker];
        if (providers.length === 0) {
            throw new Error(`BullMQ service "${config.name}" requires at least one Docker provider`);
        }
        const dependencies = dedupeDependencies([
            ...(config.dependencies ?? []),
            config.redis,
        ]);
        const { directory: _directory, redis: _redis, queueName: _queueName, queueNamePrefix: _queueNamePrefix, concurrency: _concurrency, jobsModule: _jobsModule, packageDependencies: _packageDependencies, packageDevDependencies: _packageDevDependencies, ...dockerConfig } = config;
        super({
            ...dockerConfig,
            docker: providers[0],
            dockerfile: path.join(directory, "Dockerfile"),
            buildContext: ".",
            ports: [],
            command: [],
            dependencies,
        });
        this.providers = providers;
        this.directory = directory;
        this.redis = config.redis;
        this.queueName = config.queueName ?? config.name;
        this.queueNamePrefix = config.queueNamePrefix;
        this.concurrency = config.concurrency ?? 4;
        this.jobsModule = config.jobsModule ?? "./jobs/index.js";
        this.packageDependencies = config.packageDependencies ?? {};
        this.packageDevDependencies = config.packageDevDependencies ?? {};
    }
    get envPrefix() {
        return this.name.replaceAll("-", "_").toUpperCase();
    }
    get serviceType() {
        return "bullmq-worker";
    }
    async onInit(context) {
        const applicationDirectory = this.getApplicationDirectory(context);
        const packageChanged = await ensurePackageJson(context, applicationDirectory, this.name, this.packageDependencies, this.packageDevDependencies);
        await Promise.all([
            writeFileIfMissing(context, path.join(applicationDirectory, "src", "queue.ts"), queueTemplate(this.queueName)),
            writeFileIfMissing(context, path.join(applicationDirectory, "src", "worker.ts"), workerTemplate(this.jobsModule, this.concurrency)),
            writeFileIfMissing(context, path.join(applicationDirectory, "src", "jobs", "index.ts"), jobsTemplate()),
            writeFileIfMissing(context, path.join(applicationDirectory, "tsconfig.json"), typescriptConfigTemplate()),
            writeFileIfMissing(context, path.join(applicationDirectory, "Dockerfile"), dockerfileTemplate(this.directory)),
            writeFileIfMissing(context, path.join(applicationDirectory, ".dockerignore"), dockerignoreTemplate),
        ]);
        if (packageChanged ||
            !(await fileExists(path.join(applicationDirectory, "node_modules", ".bin", "tsx")))) {
            await this.installDependencies(context, applicationDirectory);
        }
    }
    async onDev(context) {
        const applicationDirectory = this.getApplicationDirectory(context);
        const environment = await this.getDevEnvironment(context);
        this.devProcess = this.startDevProcess(context, applicationDirectory, environment);
        this.observeWorkerDevProcess(context, this.devProcess);
        await this.onContainerStarted(context);
    }
    async onDeploy(context) {
        for (const provider of this.providers) {
            await provider.assertHostReady(context);
            await this.prepareImageForProvider(context, provider);
            const config = await this.getDockerRunConfigForProvider(context, provider);
            config.configHash = provider.getContainerConfigHash(config);
            let environmentFile;
            try {
                environmentFile = await this.writeDeployEnvironmentFileForProvider(context, provider, config);
                await provider.runContainer(context, config);
            }
            finally {
                if (environmentFile != null) {
                    await provider.removeRuntimeFile(context, environmentFile);
                }
            }
        }
        await this.onContainerStarted(context);
    }
    async getContainerEnvironment(context) {
        return {
            ...await super.getContainerEnvironment(context),
            REDIS_URL: await this.resolveRedisUrl(context, "container"),
            QUEUE_NAME_PREFIX: this.resolveQueueNamePrefix(context),
        };
    }
    async onContainerStarted(context) {
        this.setOutputs(context.stage, await this.getOutputs(context));
    }
    async getOutputs(context) {
        return {
            redisUrl: await this.resolveRedisUrl(context, "host"),
            queueName: this.resolveQueueName(context),
        };
    }
    async getEnvironmentVariables(context, target = "host") {
        const redisUrl = await this.resolveRedisUrl(context, target);
        const prefix = this.envPrefix;
        return {
            [`${prefix}_REDIS_URL`]: redisUrl,
            [`${prefix}_QUEUE_NAME`]: this.resolveQueueName(context),
        };
    }
    getApplicationDirectory(context) {
        return path.resolve(context.rootDir, this.directory);
    }
    async installDependencies(context, applicationDirectory) {
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
    startDevProcess(context, applicationDirectory, environment) {
        const args = ["exec", "--", "tsx", "watch", "src/worker.ts"];
        if (context.dryRun) {
            context.writeLog(`[dry-run:local] npm ${args.join(" ")} (cwd: ${applicationDirectory})\n`);
            return spawn(process.execPath, ["-e", ""], { stdio: "ignore" });
        }
        const child = spawn("npm", args, {
            cwd: applicationDirectory,
            env: environment,
            stdio: context.logSink == null ? "inherit" : ["ignore", "pipe", "pipe"],
        });
        child.stdout?.on("data", (chunk) => {
            context.writeLog(chunk.toString("utf8"), "stdout");
        });
        child.stderr?.on("data", (chunk) => {
            context.writeLog(chunk.toString("utf8"), "stderr");
        });
        return child;
    }
    async getDevEnvironment(context) {
        return {
            ...context.env,
            ...await this.getDependenciesEnvironmentVariables(context, "host"),
            ...this.environment,
            REDIS_URL: await this.resolveRedisUrl(context, "host"),
            QUEUE_NAME_PREFIX: this.resolveQueueNamePrefix(context),
        };
    }
    getImageForProvider(context, provider) {
        return this.image ?? provider.getBuiltImageName(context, this.name);
    }
    async prepareImageForProvider(context, provider) {
        if (this.dockerfile == null)
            return;
        const image = this.getImageForProvider(context, provider);
        await provider.buildImage(context, {
            dockerfile: this.dockerfile,
            context: this.buildContext,
            image,
        });
        if (context instanceof DeployContext) {
            await provider.pushImage(context, image);
        }
    }
    async getDockerRunConfigForProvider(context, provider) {
        return {
            name: this.getContainerName(context),
            image: this.getImageForProvider(context, provider),
            pull: this.dockerfile == null || context instanceof DeployContext,
            network: provider.getNetwork(context),
            env: await this.getContainerEnvironment(context),
            volumes: this.volumes,
            ports: this.ports,
            command: this.command,
            restart: this.restart,
            healthCheck: this.healthCheck,
            labels: {
                ...this.labels,
                "saws.service": this.name,
                "saws.serviceType": this.serviceType,
                "saws.stage": context.stage,
            },
        };
    }
    async writeDeployEnvironmentFileForProvider(context, provider, config) {
        const contents = serializeEnvironment(config.env);
        if (contents == null)
            return undefined;
        const runtimeFile = await provider.writeRuntimeFile(context, `${this.name}/container.env`, contents);
        config.env = undefined;
        config.envFiles = [...(config.envFiles ?? []), runtimeFile.remotePath];
        return runtimeFile;
    }
    resolveQueueNamePrefix(context) {
        return this.queueNamePrefix ?? context.stage;
    }
    resolveQueueName(context) {
        const prefix = this.resolveQueueNamePrefix(context);
        return prefix ? `${prefix}-${this.queueName}` : this.queueName;
    }
    async resolveRedisUrl(context, target) {
        const env = await this.redis.getEnvironmentVariables(context, target);
        const url = env.REDIS_URL ?? findRedisUrlValue(env);
        if (url == null || url.trim().length === 0) {
            throw new Error(`BullMQ service "${this.name}" could not resolve a Redis URL from its redis dependency "${this.redis.name}".`);
        }
        return url;
    }
    observeWorkerDevProcess(context, process) {
        process.once("error", (error) => {
            context.writeLog(`${error.stack ?? error.message}\n`, "stderr");
        });
        process.once("exit", (code, signal) => {
            if (this.devProcess === process)
                this.devProcess = undefined;
            if (code !== 0 && signal !== "SIGTERM" && signal !== "SIGINT") {
                context.writeLog(`Worker process exited with code ${code ?? "unknown"}${signal == null ? "" : ` (${signal})`}\n`, "stderr");
            }
        });
    }
}
function dedupeDependencies(dependencies) {
    const seen = new Set();
    const result = [];
    for (const dependency of dependencies) {
        if (dependency == null || seen.has(dependency))
            continue;
        seen.add(dependency);
        result.push(dependency);
    }
    return result;
}
function findRedisUrlValue(env) {
    for (const [key, value] of Object.entries(env)) {
        if (key !== "REDIS_URL" && key.endsWith("_REDIS_URL"))
            return value;
    }
    return undefined;
}
async function ensurePackageJson(context, applicationDirectory, serviceName, extraDependencies, extraDevDependencies) {
    const packagePath = path.join(applicationDirectory, "package.json");
    let packageJson;
    try {
        packageJson = JSON.parse(await readFile(packagePath, "utf8"));
    }
    catch (error) {
        if (error.code !== "ENOENT")
            throw error;
        packageJson = {};
    }
    const updated = {
        ...packageJson,
        name: packageJson.name ?? toPackageName(serviceName),
        private: packageJson.private ?? true,
        type: packageJson.type ?? "module",
        scripts: addMissingEntries(packageJson.scripts, {
            dev: "tsx watch src/worker.ts",
            build: "tsc",
            start: "node dist/worker.js",
        }),
        dependencies: addMissingEntries(packageJson.dependencies, {
            "@saws/bullmq": "0.0.0",
            bullmq: "^5.71.0",
            ...extraDependencies,
        }),
        devDependencies: addMissingEntries(packageJson.devDependencies, {
            "@types/node": "^22.0.0",
            tsx: "^4.0.0",
            typescript: "^5.0.0",
            ...extraDevDependencies,
        }),
    };
    const contents = `${JSON.stringify(updated, null, 2)}\n`;
    const current = await readFile(packagePath, "utf8").catch((error) => {
        if (error.code === "ENOENT")
            return undefined;
        throw error;
    });
    if (current === contents)
        return false;
    if (context.dryRun) {
        context.writeLog(`[dry-run:local] write ${packagePath}\n`);
        return true;
    }
    await mkdir(applicationDirectory, { recursive: true });
    await writeFile(packagePath, contents);
    return true;
}
function addMissingEntries(value, required) {
    const existing = value != null && typeof value === "object" && !Array.isArray(value)
        ? value
        : {};
    return { ...required, ...existing };
}
async function writeFileIfMissing(context, filePath, contents) {
    if (await fileExists(filePath))
        return;
    if (context.dryRun) {
        context.writeLog(`[dry-run:local] write ${filePath}\n`);
        return;
    }
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, contents, { flag: "wx" });
}
async function fileExists(filePath) {
    try {
        await access(filePath);
        return true;
    }
    catch (error) {
        if (error.code !== "ENOENT")
            throw error;
        return false;
    }
}
async function runToCompletion(command, args, options) {
    await new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd: options.cwd,
            env: options.env,
            stdio: options.context.logSink == null
                ? "inherit"
                : ["ignore", "pipe", "pipe"],
        });
        child.stdout?.on("data", (chunk) => {
            options.context.writeLog(chunk.toString("utf8"), "stdout");
        });
        child.stderr?.on("data", (chunk) => {
            options.context.writeLog(chunk.toString("utf8"), "stderr");
        });
        child.once("error", reject);
        child.once("exit", (code, signal) => {
            if (code === 0) {
                resolve();
                return;
            }
            reject(new Error(`${command} exited with code ${code ?? "unknown"}${signal == null ? "" : ` (${signal})`}`));
        });
    });
}
function toPackageName(serviceName) {
    const name = serviceName
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, "-")
        .replace(/^[._-]+|[._-]+$/g, "");
    return name.length === 0 ? "bullmq-worker" : name;
}
function queueTemplate(queueName) {
    return `import { createQueue, getPrefixedQueueName } from "@saws/bullmq";

export const baseQueueName = ${JSON.stringify(queueName)};
export const queueName = getPrefixedQueueName(baseQueueName);

let queueInstance: ReturnType<typeof createQueue> | undefined;

export function getQueue() {
  queueInstance ??= createQueue(baseQueueName);
  return queueInstance;
}
`;
}
function workerTemplate(jobsModule, concurrency) {
    return `import { createWorker, getPrefixedQueueName } from "@saws/bullmq";
import { jobs } from ${JSON.stringify(jobsModule)};
import { baseQueueName } from "./queue.js";

export const worker = createWorker(
  getPrefixedQueueName(baseQueueName),
  jobs,
  { concurrency: ${concurrency} },
);
`;
}
function jobsTemplate() {
    return `import type { BackgroundJobConstructor, BullMQJobRegistry } from "@saws/bullmq";

/**
 * Register your BackgroundJob and Flow classes here. Each key must match the
 * job's \`name\` property and is the name passed to BullMQClient.enqueue.
 *
 * @example
 * import { BackgroundJob } from "@saws/bullmq";
 * import { getQueue } from "../queue.js";
 *
 * type SendEmailData = { to: string };
 * type SendEmailResult = { sent: boolean };
 *
 * class SendEmailJob extends BackgroundJob<SendEmailData, SendEmailResult> {
 *   name = "send-email";
 *   queue = getQueue();
 *
 *   async run() {
 *     return { sent: true };
 *   }
 * }
 *
 * export const jobs = {
 *   "send-email": SendEmailJob,
 * } satisfies Record<string, BackgroundJobConstructor>;
 */
export const jobs = {} satisfies Record<string, BackgroundJobConstructor>;

export type JobRegistry = BullMQJobRegistry<typeof jobs>;
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
function dockerfileTemplate(directory) {
    return `# Builds the worker alongside the @saws/bullmq workspace package. The build
# context is the SAWS repository root, so this worker directory must be a
# workspace member (for example under packages/ or an apps/* glob).
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json tsconfig.json ./
COPY packages/bullmq/package.json ./packages/bullmq/package.json
COPY ${directory}/package.json ./${directory}/package.json

RUN npm ci

COPY packages/bullmq ./packages/bullmq
COPY ${directory} ./${directory}

RUN npm run -w packages/bullmq build
RUN npm run -w ${directory} build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY packages/bullmq/package.json ./packages/bullmq/package.json
COPY ${directory}/package.json ./${directory}/package.json

RUN npm prune --omit=dev

COPY --from=builder /app/packages/bullmq/dist ./packages/bullmq/dist
COPY --from=builder /app/${directory}/dist ./${directory}/dist

CMD ["node", "${directory}/dist/worker.js"]
`;
}
const dockerignoreTemplate = `node_modules
dist
.git
.saws
`;

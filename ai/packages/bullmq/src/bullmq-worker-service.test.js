import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DeployContext, DevContext, InitContext, ServiceDefinition, } from "@saws/core";
import { DockerProvider, } from "@saws/docker";
import { Host } from "@saws/host";
import { SecretsManager } from "@saws/secrets";
import { BullMQWorkerService } from "./bullmq-worker-service.js";
class RecordingDockerProvider extends DockerProvider {
    builds = [];
    pushes = [];
    readinessChecks = 0;
    remoteRuns = [];
    async assertHostReady() {
        this.readinessChecks += 1;
    }
    async buildImage(_context, config) {
        this.builds.push(config);
    }
    async pushImage(_context, image) {
        this.pushes.push(image);
    }
    async runContainer(_context, config) {
        this.remoteRuns.push(config);
    }
    async writeRuntimeFile(context, relativePath, _contents) {
        return {
            localPath: path.join("/tmp", relativePath),
            remotePath: path.posix.join(this.getAppDirectory(context), relativePath),
        };
    }
    async removeRuntimeFile() { }
}
class FakeRedisService extends ServiceDefinition {
    redisHost;
    redisPort;
    redisPassword;
    constructor(opts = {}) {
        super({ name: opts.name ?? "redis" });
        this.redisHost = opts.host ?? "localhost";
        this.redisPort = opts.port ?? "6379";
        this.redisPassword = opts.password ?? "secret";
    }
    async getEnvironmentVariables(context, target = "host") {
        const host = target === "container" ? `${context.stage}-${this.name}` : this.redisHost;
        const port = target === "container" ? "6379" : this.redisPort;
        const url = `redis://:${this.redisPassword}@${host}:${port}`;
        return {
            [`${this.name.replaceAll("-", "_").toUpperCase()}_REDIS_URL`]: url,
        };
    }
}
class TestBullMQWorkerService extends BullMQWorkerService {
    installs = [];
    async installDependencies(_context, applicationDirectory) {
        this.installs.push(applicationDirectory);
    }
    getRunConfig(context, provider = this.providers[0]) {
        return this.getDockerRunConfigForProvider(context, provider);
    }
}
function createProvider() {
    return new RecordingDockerProvider({
        host: new Host({ name: "test", address: "example.test" }),
    });
}
function createRegistryProvider(name, registry) {
    return new RecordingDockerProvider({
        host: new Host({ name, address: `${name}.test` }),
        registry,
        auth: {
            username: "deploy",
            password: SecretsManager.reference("registry-password"),
        },
    });
}
test("exposes redis url and queue name env vars for host and container targets", async () => {
    const service = new TestBullMQWorkerService({
        name: "email-worker",
        docker: createProvider(),
        redis: new FakeRedisService({ host: "localhost", port: "16379" }),
        queueName: "emails",
    });
    const context = new DevContext({ stage: "dev" });
    assert.deepEqual(await service.getEnvironmentVariables(context, "host"), {
        EMAIL_WORKER_REDIS_URL: "redis://:secret@localhost:16379",
        EMAIL_WORKER_QUEUE_NAME: "dev-emails",
    });
    assert.deepEqual(await service.getEnvironmentVariables(context, "container"), {
        EMAIL_WORKER_REDIS_URL: "redis://:secret@dev-redis:6379",
        EMAIL_WORKER_QUEUE_NAME: "dev-emails",
    });
    assert.deepEqual(await service.getOutputs(context), {
        redisUrl: "redis://:secret@localhost:16379",
        queueName: "dev-emails",
    });
});
test("supports a custom and an empty queue name prefix", async () => {
    const context = new DevContext({ stage: "dev" });
    const custom = new TestBullMQWorkerService({
        name: "w",
        docker: createProvider(),
        redis: new FakeRedisService(),
        queueName: "emails",
        queueNamePrefix: "custom",
    });
    assert.equal((await custom.getEnvironmentVariables(context, "host"))["W_QUEUE_NAME"], "custom-emails");
    const none = new TestBullMQWorkerService({
        name: "w",
        docker: createProvider(),
        redis: new FakeRedisService(),
        queueName: "emails",
        queueNamePrefix: "",
    });
    assert.equal((await none.getEnvironmentVariables(context, "host"))["W_QUEUE_NAME"], "emails");
});
test("builds a container run config wired to the redis dependency", async () => {
    const service = new TestBullMQWorkerService({
        name: "email-worker",
        docker: createProvider(),
        redis: new FakeRedisService({ host: "localhost", port: "16379" }),
        queueName: "emails",
        concurrency: 8,
    });
    const context = new DevContext({ stage: "dev" });
    const config = await service.getRunConfig(context);
    assert.equal(config.image, "saws-dev-email-worker:latest");
    assert.equal(config.pull, false);
    assert.equal(config.network, "saws-dev");
    assert.equal(config.env?.REDIS_URL, "redis://:secret@dev-redis:6379");
    assert.equal(config.env?.QUEUE_NAME_PREFIX, "dev");
    assert.deepEqual(config.command, []);
    assert.deepEqual(config.ports, []);
    assert.equal(config.labels?.["saws.serviceType"], "bullmq-worker");
});
test("requires at least one Docker provider", () => {
    assert.throws(() => new TestBullMQWorkerService({
        name: "w",
        docker: [],
        redis: new FakeRedisService(),
    }), /at least one Docker provider/);
});
test("derives the environment prefix from the service name", () => {
    const service = new TestBullMQWorkerService({
        name: "my-worker",
        docker: createProvider(),
        redis: new FakeRedisService(),
    });
    assert.equal(service.envPrefix, "MY_WORKER");
});
test("defaults queue name and jobs module from the service name", () => {
    const service = new TestBullMQWorkerService({
        name: "my-worker",
        docker: createProvider(),
        redis: new FakeRedisService(),
    });
    assert.equal(service.queueName, "my-worker");
    assert.equal(service.jobsModule, "./jobs/index.js");
    assert.equal(service.concurrency, 4);
});
test("deploys the worker on every provided host", async () => {
    const providerA = createRegistryProvider("a", "registry.a/team/");
    const providerB = createRegistryProvider("b", "registry.b/team/");
    const service = new TestBullMQWorkerService({
        name: "email-worker",
        docker: [providerA, providerB],
        redis: new FakeRedisService(),
    });
    await service.deploy(new DeployContext({ stage: "production" }));
    assert.equal(providerA.readinessChecks, 1);
    assert.equal(providerB.readinessChecks, 1);
    assert.equal(providerA.remoteRuns.length, 1);
    assert.equal(providerB.remoteRuns.length, 1);
    assert.equal(providerA.remoteRuns[0]?.image, "registry.a/team/production-email-worker:latest");
    assert.equal(providerB.remoteRuns[0]?.image, "registry.b/team/production-email-worker:latest");
    assert.equal(providerA.remoteRuns[0]?.name, "production-email-worker");
    assert.equal(providerA.remoteRuns[0]?.env, undefined);
    assert.equal(providerA.remoteRuns[0]?.envFiles?.length, 1);
    assert.deepEqual(providerA.builds.map((build) => build.image), ["registry.a/team/production-email-worker:latest"]);
    assert.deepEqual(providerA.pushes, [
        "registry.a/team/production-email-worker:latest",
    ]);
    assert.deepEqual(providerB.pushes, [
        "registry.b/team/production-email-worker:latest",
    ]);
});
test("deploys a single provider once", async () => {
    const provider = createRegistryProvider("single", "registry.test/team/");
    const service = new TestBullMQWorkerService({
        name: "email-worker",
        docker: provider,
        redis: new FakeRedisService(),
    });
    await service.deploy(new DeployContext({ stage: "production" }));
    assert.equal(provider.readinessChecks, 1);
    assert.equal(provider.remoteRuns.length, 1);
    assert.equal(provider.builds.length, 1);
});
test("scaffolds queue, worker, jobs, package.json, Dockerfile and dockerignore", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "saws-bullmq-init-"));
    const service = new TestBullMQWorkerService({
        name: "email-worker",
        docker: createProvider(),
        redis: new FakeRedisService(),
        directory: "workers/emails",
        queueName: "emails",
        concurrency: 8,
    });
    await service.init(new InitContext({ stage: "local", rootDir }));
    const appDir = path.join(rootDir, "workers", "emails");
    const queue = await readFile(path.join(appDir, "src", "queue.ts"), "utf8");
    assert.match(queue, /export const baseQueueName = "emails"/);
    assert.match(queue, /export function getQueue/);
    const worker = await readFile(path.join(appDir, "src", "worker.ts"), "utf8");
    assert.match(worker, /import \{ jobs \} from "\.\/jobs\/index\.js"/);
    assert.match(worker, /concurrency: 8/);
    const jobs = await readFile(path.join(appDir, "src", "jobs", "index.ts"), "utf8");
    assert.match(jobs, /export type JobRegistry = BullMQJobRegistry<typeof jobs>/);
    assert.match(jobs, /satisfies Record<string, BackgroundJobConstructor>/);
    const pkg = JSON.parse(await readFile(path.join(appDir, "package.json"), "utf8"));
    assert.equal(pkg.name, "email-worker");
    assert.equal(pkg.dependencies["@saws/bullmq"], "0.0.0");
    assert.equal(pkg.dependencies.bullmq, "^5.71.0");
    assert.equal(pkg.scripts.dev, "tsx watch src/worker.ts");
    assert.equal(pkg.scripts.start, "node dist/worker.js");
    const dockerfile = await readFile(path.join(appDir, "Dockerfile"), "utf8");
    assert.match(dockerfile, /CMD \["node", "workers\/emails\/dist\/worker\.js"\]/);
    assert.match(dockerfile, /npm run -w packages\/bullmq build/);
    assert.match(dockerfile, /npm run -w workers\/emails build/);
    const dockerignore = await readFile(path.join(appDir, ".dockerignore"), "utf8");
    assert.match(dockerignore, /node_modules/);
    assert.ok(service.installs.includes(appDir));
});
test("does not overwrite existing scaffolded files", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "saws-bullmq-init-"));
    const appDir = path.join(rootDir, "workers", "emails");
    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(path.join(appDir, "src"), { recursive: true });
    await writeFile(path.join(appDir, "src", "queue.ts"), "// custom queue\n");
    const service = new TestBullMQWorkerService({
        name: "email-worker",
        docker: createProvider(),
        redis: new FakeRedisService(),
        directory: "workers/emails",
    });
    await service.init(new InitContext({ stage: "local", rootDir }));
    const queue = await readFile(path.join(appDir, "src", "queue.ts"), "utf8");
    assert.equal(queue, "// custom queue\n");
});

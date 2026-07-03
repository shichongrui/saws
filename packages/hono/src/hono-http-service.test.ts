import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  DeployContext,
  DevContext,
  ExitContext,
  InitContext,
  type RuntimeContext,
  ServiceDefinition,
} from "@saws/core";
import type {
  EnvironmentVariables,
  EnvironmentVariableTarget,
} from "@saws/core";
import { DockerProvider } from "@saws/docker";
import type {
  DockerBlueGreenConfig,
  DockerBuildConfig,
  DockerRunConfig,
  RuntimeFile,
} from "@saws/docker";
import { Host } from "@saws/host";
import { SecretsManager } from "@saws/secrets";
import { HonoHTTPService } from "./hono-http-service.js";

class RecordingDockerProvider extends DockerProvider {
  builds: DockerBuildConfig[] = [];
  localRuns: DockerRunConfig[] = [];
  remoteRuns: DockerRunConfig[] = [];
  blueGreenRuns: DockerBlueGreenConfig[] = [];

  override async buildImage(
    _context: RuntimeContext,
    config: DockerBuildConfig
  ) {
    this.builds.push(config);
  }

  override async pushImage(_context: DeployContext, _image: string) {}

  override async startLocalContainer(
    _context: DevContext,
    config: DockerRunConfig
  ): Promise<ChildProcess> {
    this.localRuns.push(config);
    return spawn(process.execPath, ["-e", ""], { stdio: "ignore" });
  }

  override async runContainer(
    _context: DeployContext,
    config: DockerRunConfig
  ) {
    this.remoteRuns.push(config);
  }

  override async runBlueGreenContainer(
    _context: DeployContext,
    config: DockerBlueGreenConfig
  ) {
    this.blueGreenRuns.push(config);
  }

  override async writeRuntimeFile(
    context: DeployContext,
    relativePath: string,
    _contents: string
  ): Promise<RuntimeFile> {
    return {
      localPath: `/tmp/${relativePath}`,
      remotePath: path.posix.join(this.getAppDirectory(context), relativePath),
    };
  }

  override async removeRuntimeFile(
    _context: DeployContext,
    _runtimeFile: RuntimeFile
  ) {}
}

class TestHonoHTTPService extends HonoHTTPService {
  installs: string[] = [];
  devStarts: Array<{
    directory: string;
    environment: EnvironmentVariables;
  }> = [];

  protected override async installDependencies(
    _context: InitContext,
    applicationDirectory: string
  ) {
    this.installs.push(applicationDirectory);
  }

  protected override startDevProcess(
    _context: DevContext,
    applicationDirectory: string,
    environment: EnvironmentVariables
  ) {
    this.devStarts.push({ directory: applicationDirectory, environment });
    return spawn(process.execPath, ["-e", ""], { stdio: "ignore" });
  }
}

class EnvironmentService extends ServiceDefinition {
  targets: EnvironmentVariableTarget[] = [];

  override async getEnvironmentVariables(
    _context: RuntimeContext,
    target: EnvironmentVariableTarget = "host"
  ) {
    this.targets.push(target);
    return { DATABASE_URL: `${target}://database` };
  }
}

function createProvider() {
  return new RecordingDockerProvider({
    host: new Host({ name: "test", address: "example.test" }),
    registry: "registry.example.com/team",
    auth: {
      username: "test-user",
      password: SecretsManager.reference("registry-password"),
    },
  });
}

test("scaffolds an isolated Hono TypeScript application without replacing source", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "saws-hono-init-"));
  const applicationDirectory = path.join(rootDir, "services", "api");
  const sourcePath = path.join(applicationDirectory, "src", "index.ts");
  const service = new TestHonoHTTPService({
    name: "Public API",
    directory: "services/api",
    docker: createProvider(),
  });

  await service.init(new InitContext({ stage: "local", rootDir }));

  const packageJson = JSON.parse(
    await readFile(path.join(applicationDirectory, "package.json"), "utf8")
  );
  const source = await readFile(sourcePath, "utf8");
  const tsconfig = JSON.parse(
    await readFile(path.join(applicationDirectory, "tsconfig.json"), "utf8")
  );
  const dockerfile = await readFile(
    path.join(applicationDirectory, "Dockerfile"),
    "utf8"
  );

  assert.equal(packageJson.name, "public-api");
  assert.equal(packageJson.scripts.dev, "tsx watch src/index.ts");
  assert.equal(packageJson.dependencies.hono, "^4.0.0");
  assert.equal(packageJson.devDependencies.typescript, "^5.0.0");
  assert.equal(tsconfig.compilerOptions.module, "NodeNext");
  assert.match(source, /new Hono\(\)/);
  assert.match(dockerfile, /RUN npm run build/);
  assert.deepEqual(service.installs, [applicationDirectory]);

  await writeFile(sourcePath, "// application-owned source\n");
  const nextService = new TestHonoHTTPService({
    name: "Public API",
    directory: "services/api",
    docker: createProvider(),
  });
  await nextService.init(new InitContext({ stage: "local", rootDir }));

  assert.equal(await readFile(sourcePath, "utf8"), "// application-owned source\n");
});

test("runs tsx directly in development with host dependency environment", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "saws-hono-dev-"));
  const dependency = new EnvironmentService({ name: "database" });
  const docker = createProvider();
  const service = new TestHonoHTTPService({
    name: "api",
    directory: "services/api",
    docker,
    dependencies: [dependency],
    port: 4321,
    environment: { DATABASE_URL: "explicit://database", FEATURE: "enabled" },
  });

  await service.dev(
    new DevContext({
      stage: "dev",
      rootDir,
      env: { PATH: process.env.PATH ?? "" },
    })
  );
  await service.exit(new ExitContext({ stage: "dev", rootDir }));

  assert.equal(docker.builds.length, 0);
  assert.equal(docker.localRuns.length, 0);
  assert.deepEqual(dependency.targets, ["host"]);
  assert.equal(service.devStarts[0]?.directory, path.join(rootDir, "services/api"));
  assert.equal(service.devStarts[0]?.environment.PORT, "4321");
  assert.equal(
    service.devStarts[0]?.environment.DATABASE_URL,
    "explicit://database"
  );
  assert.equal(service.devStarts[0]?.environment.FEATURE, "enabled");
});

test("exposes its URL to host and container dependents", async () => {
  const service = new HonoHTTPService({
    name: "public-api",
    docker: createProvider(),
    port: 4321,
    ports: ["8080:4321"],
  });

  const devContext = new DevContext({ stage: "dev" });
  assert.deepEqual(await service.getEnvironmentVariables(devContext), {
    PUBLIC_API_URL: "http://127.0.0.1:4321",
  });
  assert.deepEqual(
    await service.getEnvironmentVariables(devContext, "container"),
    { PUBLIC_API_URL: "http://host.docker.internal:4321" }
  );

  const deployContext = new DeployContext({ stage: "production" });
  assert.deepEqual(await service.getEnvironmentVariables(deployContext), {
    PUBLIC_API_URL: "http://example.test:8080",
  });
  assert.deepEqual(
    await service.getEnvironmentVariables(deployContext, "container"),
    { PUBLIC_API_URL: "http://production-public-api-proxy:4321" }
  );

  const application = new ServiceDefinition({
    name: "application",
    dependencies: [service],
  });
  assert.deepEqual(
    await application.getDependenciesEnvironmentVariables(deployContext),
    { PUBLIC_API_URL: "http://example.test:8080" }
  );
});

test("uses an explicit public URL for deployed application clients", async () => {
  const service = new HonoHTTPService({
    name: "api",
    docker: createProvider(),
    publicUrl: "https://api.example.test/",
  });

  assert.deepEqual(
    await service.getEnvironmentVariables(
      new DeployContext({ stage: "production" })
    ),
    { API_URL: "https://api.example.test" }
  );
});

test("uses tsx watch rather than building or starting Docker in development", async () => {
  const logs: string[] = [];
  const docker = createProvider();
  const service = new HonoHTTPService({
    name: "api",
    docker,
  });

  await service.dev(
    new DevContext({
      stage: "dev",
      rootDir: "/project",
      dryRun: true,
      logSink: ({ chunk }) => logs.push(chunk),
    })
  );
  await service.exit(new ExitContext({ stage: "dev", rootDir: "/project" }));

  assert.match(logs.join(""), /npm exec -- tsx watch src\/index\.ts/);
  assert.equal(docker.builds.length, 0);
  assert.equal(docker.localRuns.length, 0);
});

test("deploys the Hono app through a stable blue/green reverse proxy", async () => {
  const docker = createProvider();
  const service = new TestHonoHTTPService({
    name: "api",
    directory: "services/api",
    docker,
    port: 8080,
  });

  await service.deploy(
    new DeployContext({ stage: "production", rootDir: "/project" })
  );

  assert.deepEqual(docker.builds, [{
    dockerfile: path.join("services/api", "Dockerfile"),
    context: "services/api",
    image: "registry.example.com/team/production-api:latest",
  }]);
  assert.equal(docker.remoteRuns.length, 0);
  assert.equal(docker.blueGreenRuns[0]?.app.env, undefined);
  assert.equal(docker.blueGreenRuns[0]?.app.network, "saws-production");
  assert.deepEqual(
    docker.blueGreenRuns[0]?.app.envFiles,
    ["/opt/saws/production/api/container.env"]
  );
  assert.deepEqual(docker.blueGreenRuns[0]?.app.ports, []);
  assert.deepEqual(docker.blueGreenRuns[0]?.proxyPorts, ["8080:8080"]);
  assert.equal(
    docker.blueGreenRuns[0]?.app.image,
    "registry.example.com/team/production-api:latest"
  );
  assert.equal(
    docker.blueGreenRuns[0]?.app.labels?.["saws.serviceType"],
    "hono-http"
  );
  assert.deepEqual(docker.blueGreenRuns[0]?.app.healthCheck, {
    command:
      "node -e 'fetch(\"http://127.0.0.1:8080/\").then(response => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))'",
    interval: "10s",
    timeout: "5s",
    retries: 3,
    startPeriod: "30s",
  });
  assert.equal(docker.blueGreenRuns[0]?.appPort, 8080);
  assert.equal(docker.blueGreenRuns[0]?.healthCheckPath, "/");
  assert.equal(docker.blueGreenRuns[0]?.proxyImage, "nginx:1.27-alpine");
});

test("passes customized rollout settings to the reverse proxy deployment", async () => {
  const docker = createProvider();
  const service = new TestHonoHTTPService({
    name: "api",
    docker,
    port: 3000,
    ports: ["80:3000"],
    healthCheckPath: "/ready",
    healthCheckTimeoutSeconds: 45,
    drainTimeoutSeconds: 12,
    proxyImage: "nginx:alpine",
  });

  await service.deploy(new DeployContext({ stage: "production" }));

  assert.deepEqual(docker.blueGreenRuns[0]?.proxyPorts, ["80:3000"]);
  assert.equal(docker.blueGreenRuns[0]?.healthCheckPath, "/ready");
  assert.equal(docker.blueGreenRuns[0]?.healthCheckTimeoutSeconds, 45);
  assert.equal(docker.blueGreenRuns[0]?.drainTimeoutSeconds, 12);
  assert.equal(docker.blueGreenRuns[0]?.proxyImage, "nginx:alpine");
});

test("allows the native Hono container health check to be overridden", async () => {
  const docker = createProvider();
  const service = new TestHonoHTTPService({
    name: "api",
    docker,
    healthCheck: false,
  });

  await service.deploy(new DeployContext({ stage: "production" }));

  assert.equal(docker.blueGreenRuns[0]?.app.healthCheck, false);
});

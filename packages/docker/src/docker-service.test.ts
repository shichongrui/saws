import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DeployContext, DevContext, ExitContext } from "@saws/core";
import { Host, type HostExecOptions } from "@saws/host";
import { SecretsManager } from "@saws/secrets";
import {
  DockerProvider,
  type DockerProviderConfig,
  type DockerBlueGreenConfig,
  type DockerBuildConfig,
  type DockerRunConfig,
} from "./docker-provider.js";
import { DockerService } from "./docker-service.js";

class RecordingDockerProvider extends DockerProvider {
  builds: Array<{ stage: string; config: DockerBuildConfig }> = [];
  pushes: string[] = [];
  localRuns: DockerRunConfig[] = [];
  remoteRuns: DockerRunConfig[] = [];
  readinessChecks = 0;

  override async assertHostReady() {
    this.readinessChecks += 1;
  }

  override async buildImage(
    context: DevContext | DeployContext,
    config: DockerBuildConfig
  ) {
    this.builds.push({ stage: context.stage, config });
  }

  override async pushImage(_context: DeployContext, image: string) {
    this.pushes.push(image);
  }

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
}

function createProvider(registry?: string) {
  const host = new Host({ name: "test", address: "example.test" });
  return registry == null
    ? new RecordingDockerProvider({ host })
    : new RecordingDockerProvider({
        host,
        registry,
        auth: {
          username: "test-user",
          password: SecretsManager.reference("registry-password"),
        },
      });
}

test("requires exactly one Docker image source", () => {
  const docker = createProvider();

  assert.throws(
    () => new DockerService({ name: "web", docker }),
    /requires exactly one of image or dockerfile/
  );
  assert.throws(
    () =>
      new DockerService({
        name: "web",
        docker,
        image: "nginx:alpine",
        dockerfile: "Dockerfile",
      }),
    /requires exactly one of image or dockerfile/
  );
});

test("derives distinct Docker networks and application directories per stage", () => {
  const docker = new DockerProvider({
    host: new Host({ name: "test", address: "example.test" }),
    network: "my-app",
    appDirectory: "/srv/my-app",
  });
  const staging = new DeployContext({ stage: "staging" });
  const production = new DeployContext({ stage: "production" });

  assert.equal(docker.getNetwork(staging), "my-app-staging");
  assert.equal(docker.getNetwork(production), "my-app-production");
  assert.equal(docker.getAppDirectory(staging), "/srv/my-app/staging");
  assert.equal(docker.getAppDirectory(production), "/srv/my-app/production");
});

test("rejects stages that are unsafe as Docker names or path segments", () => {
  assert.throws(
    () => new DeployContext({ stage: "../production" }),
    /Invalid stage/
  );
  assert.throws(
    () => new DeployContext({ stage: "Production" }),
    /Invalid stage/
  );
});

test("builds a Dockerfile locally and runs the resulting image without pulling", async () => {
  const docker = createProvider();
  const service = new DockerService({
    name: "Web API",
    docker,
    dockerfile: "services/web/Dockerfile",
    buildContext: "services/web",
  });
  const context = new DevContext({ stage: "dev", rootDir: "/project" });

  await service.dev(context);
  await service.exit(new ExitContext({ stage: "dev", rootDir: "/project" }));

  assert.deepEqual(docker.builds, [{
    stage: "dev",
    config: {
      dockerfile: "services/web/Dockerfile",
      context: "services/web",
      image: "saws-dev-web-api:latest",
    },
  }]);
  assert.equal(docker.pushes.length, 0);
  assert.equal(docker.localRuns[0]?.image, "saws-dev-web-api:latest");
  assert.equal(docker.localRuns[0]?.pull, false);
});

test("continues to run an existing image as a pull-based service", async () => {
  const docker = createProvider();
  const service = new DockerService({
    name: "web",
    docker,
    image: "nginx:alpine",
  });

  await service.dev(new DevContext({ stage: "dev" }));
  await service.exit(new ExitContext({ stage: "dev" }));

  assert.equal(docker.builds.length, 0);
  assert.equal(docker.localRuns[0]?.image, "nginx:alpine");
  assert.equal(docker.localRuns[0]?.pull, true);
});

test("passes native health checks through to local and deployed containers", async () => {
  const docker = createProvider();
  const healthCheck = {
    command: "wget -q -O /dev/null http://127.0.0.1/ready",
    interval: "15s",
    timeout: "3s",
    retries: 4,
    startPeriod: "20s",
  };
  const service = new DockerService({
    name: "web",
    docker,
    image: "nginx:alpine",
    healthCheck,
  });

  await service.dev(new DevContext({ stage: "dev" }));
  await service.exit(new ExitContext({ stage: "dev" }));
  await service.deploy(new DeployContext({ stage: "production" }));

  assert.deepEqual(docker.localRuns[0]?.healthCheck, healthCheck);
  assert.deepEqual(docker.remoteRuns[0]?.healthCheck, healthCheck);
});

test("renders and hashes Docker health check configuration", async () => {
  const host = new RecordingHost({ name: "test", address: "example.test" });
  const docker = new DockerProvider({ host });
  const base: DockerRunConfig = {
    name: "production-web",
    image: "nginx:alpine",
  };
  const withHealthCheck: DockerRunConfig = {
    ...base,
    healthCheck: {
      command: "wget -q -O /dev/null http://127.0.0.1/",
      interval: "10s",
      timeout: "2s",
      retries: 3,
      startPeriod: "5s",
    },
  };

  await docker.runContainer(
    new DeployContext({ stage: "production" }),
    withHealthCheck
  );

  const run = host.commands.at(-1) ?? "";
  assert.match(run, /--health-cmd 'wget -q -O \/dev\/null http:\/\/127\.0\.0\.1\/'/);
  assert.match(run, /--health-interval '10s'/);
  assert.match(run, /--health-timeout '2s'/);
  assert.match(run, /--health-retries '3'/);
  assert.match(run, /--health-start-period '5s'/);
  assert.notEqual(
    docker.getContainerConfigHash(base),
    docker.getContainerConfigHash(withHealthCheck)
  );
});

test("can disable a health check inherited from an image", async () => {
  const logs: string[] = [];
  const docker = new DockerProvider({
    host: new Host({ name: "test", address: "example.test" }),
  });

  await docker.startLocalContainer(
    new DevContext({
      stage: "dev",
      dryRun: true,
      logSink: ({ chunk }) => logs.push(chunk),
    }),
    {
      name: "dev-worker",
      image: "worker:latest",
      pull: false,
      healthCheck: false,
    }
  );

  assert.match(logs.join(""), /--no-healthcheck/);
});

test("builds, pushes, and deploys a Dockerfile image through the registry", async () => {
  const docker = createProvider("registry.example.com/team/");
  const service = new DockerService({
    name: "web",
    docker,
    dockerfile: "Dockerfile",
  });

  await service.deploy(
    new DeployContext({ stage: "production", rootDir: "/project" })
  );

  const image = "registry.example.com/team/production-web:latest";
  assert.equal(docker.builds[0]?.config.image, image);
  assert.deepEqual(docker.pushes, [image]);
  assert.equal(docker.remoteRuns[0]?.image, image);
  assert.equal(docker.remoteRuns[0]?.pull, true);
});

test("runs services on their stage-specific provider network", async () => {
  const host = new Host({ name: "test", address: "example.test" });
  const docker = new RecordingDockerProvider({
    host,
    network: "my-app",
  });
  const service = new DockerService({
    name: "web",
    docker,
    image: "nginx:alpine",
  });

  await service.deploy(new DeployContext({ stage: "production" }));

  assert.equal(docker.remoteRuns[0]?.network, "my-app-production");
});

test("checks host readiness before deploying its Docker service", async () => {
  const docker = createProvider();
  const service = new DockerService({
    name: "web",
    docker,
    image: "nginx:alpine",
  });

  await service.deploy(new DeployContext({ stage: "production" }));

  assert.equal(docker.readinessChecks, 1);
  assert.equal(docker.remoteRuns.length, 1);
});

test("exits before image or container work when the host is not ready", async () => {
  const docker = createProvider("registry.example.com/team");
  docker.assertHostReady = async () => {
    throw new Error("Run: saws host configure test");
  };
  const service = new DockerService({
    name: "web",
    docker,
    dockerfile: "Dockerfile",
  });

  await assert.rejects(
    service.deploy(new DeployContext({ stage: "production" })),
    /saws host configure test/
  );
  assert.equal(docker.builds.length, 0);
  assert.equal(docker.pushes.length, 0);
  assert.equal(docker.remoteRuns.length, 0);
});

test("requires a registry when deploying a Dockerfile service", async () => {
  const service = new DockerService({
    name: "web",
    docker: createProvider(),
    dockerfile: "Dockerfile",
  });

  await assert.rejects(
    service.deploy(new DeployContext({ stage: "production" })),
    /has no registry configured/
  );
});

test("requires secret-backed auth with a configured registry", () => {
  const host = new Host({ name: "test", address: "example.test" });

  assert.throws(
    () => new DockerProvider({
      host,
      registry: "///",
      auth: {
        username: "test-user",
        password: SecretsManager.reference("registry-password"),
      },
    }),
    /registry cannot be empty/
  );
  assert.throws(
    () => new DockerProvider({
      host,
      registry: "registry.example.com/team",
    } as unknown as DockerProviderConfig),
    /auth is required/
  );
  assert.throws(
    () => new DockerProvider({
      host,
      registry: "registry.example.com/team",
      auth: {
        username: "test-user",
        password: "plaintext",
      },
    } as unknown as DockerProviderConfig),
    /must be a SecretsManager reference/
  );
});

test("logs in locally and remotely once per deployment context", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "saws-docker-auth-"));
  const secrets = new SecretsManager({ stage: "production", rootDir });
  await secrets.set("registry-password", "super-secret-token");

  const host = new RecordingHost({ name: "test", address: "example.test" });
  const docker = new DockerProvider({
    host,
    registry: "registry.example.com/team",
    auth: {
      username: "deploy-user",
      password: SecretsManager.reference("registry-password"),
    },
  });
  const logs: string[] = [];
  const context = new DeployContext({
    stage: "production",
    rootDir,
    dryRun: true,
    logSink: ({ chunk }) => logs.push(chunk),
  });

  await docker.pushImage(context, "registry.example.com/team/app:latest");
  await docker.pushImage(context, "registry.example.com/team/worker:latest");
  await docker.prepare(context);
  await docker.prepare(context);

  const localLogs = logs.join("");
  assert.equal(
    localLogs.match(/docker login/g)?.length,
    1,
    "local login should run once"
  );
  assert.match(
    localLogs,
    /docker login 'registry\.example\.com' --username 'deploy-user' --password-stdin/
  );
  assert.doesNotMatch(localLogs, /super-secret-token/);

  const remoteLogins = host.calls.filter(({ command }) =>
    command.startsWith("docker login")
  );
  assert.equal(remoteLogins.length, 1, "remote login should run once");
  assert.equal(remoteLogins[0]?.input, "super-secret-token\n");
  assert.doesNotMatch(remoteLogins[0]?.command ?? "", /super-secret-token/);
});

test("resolves Dockerfile and default build context paths from the runtime root", async () => {
  const logs: string[] = [];
  const docker = new DockerProvider({
    host: new Host({ name: "test", address: "example.test" }),
  });

  await docker.buildImage(
    new DevContext({
      stage: "dev",
      rootDir: "/project",
      dryRun: true,
      logSink: ({ chunk }) => logs.push(chunk),
    }),
    {
      dockerfile: "services/web/Dockerfile",
      image: "saws-dev-web:latest",
    }
  );

  assert.match(logs.join(""), /-f '\/project\/services\/web\/Dockerfile'/);
  assert.match(logs.join(""), /'\/project\/services\/web'$/m);
});

class RecordingHost extends Host {
  commands: string[] = [];
  calls: Array<{ command: string; input?: string }> = [];
  copies: Array<{ localPath: string; remotePath: string }> = [];

  override async exec(command: string, options: HostExecOptions = {}) {
    this.commands.push(command);
    this.calls.push({ command, input: options.input });
  }

  override async copyFile(localPath: string, remotePath: string) {
    this.copies.push({ localPath, remotePath });
  }
}

test("isolates generated runtime files by stage locally and remotely", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "saws-docker-runtime-"));
  const host = new RecordingHost({ name: "main", address: "example.test" });
  const docker = new DockerProvider({
    host,
    appDirectory: "/srv/my-app",
  });
  const staging = new DeployContext({ stage: "staging", rootDir });
  const production = new DevContext({ stage: "production", rootDir });

  const remote = await docker.writeRuntimeFile(
    staging,
    "api/container.env",
    "TOKEN=staging\n"
  );
  const local = await docker.writeLocalRuntimeFile(
    production,
    "api/container.env",
    "TOKEN=production\n"
  );

  assert.equal(
    remote.localPath,
    path.join(
      rootDir,
      ".saws",
      "hosts",
      "main",
      "staging",
      "api",
      "container.env"
    )
  );
  assert.equal(
    remote.remotePath,
    "/srv/my-app/staging/api/container.env"
  );
  assert.equal(host.copies[0]?.remotePath, remote.remotePath);
  assert.equal(
    local,
    path.join(
      rootDir,
      ".saws",
      "local",
      "production",
      "api",
      "container.env"
    )
  );
  assert.equal(await readFile(remote.localPath, "utf8"), "TOKEN=staging\n");
  assert.equal(await readFile(local, "utf8"), "TOKEN=production\n");
});

test("runs blue/green app slots behind a stable Nginx proxy", async () => {
  const host = new RecordingHost({ name: "test", address: "example.test" });
  const docker = new DockerProvider({ host, appDirectory: "/opt/saws" });
  const config: DockerBlueGreenConfig = {
    app: {
      name: "production-api",
      image: "registry.example.com/api:latest",
      envFiles: ["/opt/saws/production/api/container.env"],
      labels: {
        "saws.service": "api",
        "saws.serviceType": "hono-http",
        "saws.stage": "production",
      },
    },
    appPort: 3000,
    proxyPorts: ["80:3000"],
    healthCheckPath: "/ready",
    healthCheckTimeoutSeconds: 20,
    drainTimeoutSeconds: 5,
  };

  await docker.runBlueGreenContainer(
    new DeployContext({ stage: "production" }),
    config
  );

  const rollout = host.commands.at(-1) ?? "";
  assert.match(rollout, /production-api-blue/);
  assert.match(rollout, /production-api-green/);
  assert.match(rollout, /--network 'saws-production'/);
  assert.match(
    rollout,
    /\/opt\/saws\/production\/api\/proxy\/nginx\.conf/
  );
  assert.match(rollout, /saws\.activeSlot/);
  assert.match(rollout, /current_proxy_hash=/);
  assert.match(rollout, /docker rm -f "\$proxy"/);
  assert.match(rollout, /wget -q -T 1/);
  assert.match(rollout, /'\/ready'/);
  assert.match(rollout, /nginx -s reload/);
  assert.match(rollout, /--health-cmd/);
  assert.match(rollout, /sleep 5/);
  assert.match(rollout, /-p '80:3000'/);
  assert.doesNotMatch(rollout, /app_run=.*-p '80:3000'/);
  assert.equal(
    spawnSync("/bin/sh", ["-n"], { input: rollout }).status,
    0,
    "generated rollout command must be valid POSIX shell"
  );
});

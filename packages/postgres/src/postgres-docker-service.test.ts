import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DeployContext, DevContext, InitContext } from "@saws/core";
import { DockerProvider } from "@saws/docker";
import { Host, type HostExecOptions } from "@saws/host";
import { SecretsManager } from "@saws/secrets";
import { PostgresDockerService } from "./postgres-docker-service.js";

class TestPostgresDockerService extends PostgresDockerService {
  installs: string[] = [];

  protected override async installDependencies(context: InitContext) {
    this.installs.push(context.rootDir);
  }

  getRunConfig(context: DevContext) {
    return this.getDockerRunConfig(context);
  }
}

function createProvider() {
  return new DockerProvider({
    host: new Host({ name: "test", address: "example.test" }),
  });
}

class RecordingHost extends Host {
  commands: string[] = [];
  copies: Array<{ remotePath: string; contents: string }> = [];
  failMigrations = false;

  override async assertReady() {}

  override async exec(command: string, _options: HostExecOptions = {}) {
    this.commands.push(command);
    if (this.failMigrations && command.startsWith("docker run --rm")) {
      throw new Error("migration failed");
    }
  }

  override async copyFile(localPath: string, remotePath: string) {
    this.copies.push({
      remotePath,
      contents: await readFile(localPath, "utf8"),
    });
  }
}

test("initializes dbmate and the migrations directory without replacing package metadata", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "saws-postgres-init-"));
  const packagePath = path.join(rootDir, "package.json");
  await writeFile(
    packagePath,
    `${JSON.stringify({
      name: "existing-project",
      scripts: { test: "node --test" },
      devDependencies: { typescript: "^5.0.0" },
    }, null, 2)}\n`
  );
  const service = new TestPostgresDockerService({
    name: "db",
    docker: createProvider(),
  });

  await service.init(new InitContext({ stage: "local", rootDir }));

  const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
  assert.equal(packageJson.name, "existing-project");
  assert.equal(packageJson.scripts.test, "node --test");
  assert.equal(packageJson.devDependencies.typescript, "^5.0.0");
  assert.equal(packageJson.devDependencies.dbmate, "^2.0.0");
  assert.equal(
    (await stat(path.join(rootDir, "db", "migrations"))).isDirectory(),
    true
  );
  assert.deepEqual(service.installs, [rootDir]);
});

test("reports the published host port while container connections use port 5432", async () => {
  const service = new PostgresDockerService({
    name: "db",
    docker: createProvider(),
    port: 15432,
    database: "app",
    username: "app-user",
    password: "secret",
  });
  const context = new DevContext({ stage: "development" });

  assert.deepEqual(await service.getEnvironmentVariables(context), {
    DB_POSTGRES_HOST: "localhost",
    DB_POSTGRES_PORT: "15432",
    DB_POSTGRES_USERNAME: "app-user",
    DB_POSTGRES_PASSWORD: "secret",
    DB_POSTGRES_DB_NAME: "app",
    DB_DATABASE_URL: "postgresql://app-user:secret@localhost:15432/app",
  });
  assert.deepEqual(
    await service.getEnvironmentVariables(context, "container"),
    {
      DB_POSTGRES_HOST: "development-db",
      DB_POSTGRES_PORT: "5432",
      DB_POSTGRES_USERNAME: "app-user",
      DB_POSTGRES_PASSWORD: "secret",
      DB_POSTGRES_DB_NAME: "app",
      DB_DATABASE_URL:
        "postgresql://app-user:secret@development-db:5432/app",
    }
  );
  assert.deepEqual(await service.getOutputs(context), {
    postgresHost: "localhost",
    postgresPort: "15432",
    postgresUsername: "app-user",
    postgresPassword: "secret",
    postgresDBName: "app",
    databaseUrl: "postgresql://app-user:secret@localhost:15432/app",
  });
});

test("creates the configured database and user with a secret-backed password", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "saws-postgres-secret-"));
  await new SecretsManager({
    stage: "production",
    rootDir,
  }).set("database-password", "secret from manager");
  const service = new TestPostgresDockerService({
    name: "db",
    docker: createProvider(),
    database: "application",
    username: "application-user",
    password: SecretsManager.reference("database-password"),
  });
  const context = new DevContext({
    stage: "production",
    rootDir,
  });

  assert.deepEqual((await service.getRunConfig(context)).env, {
    POSTGRES_USER: "application-user",
    POSTGRES_PASSWORD: "secret from manager",
    POSTGRES_DB: "application",
  });
  assert.equal(
    (await service.getEnvironmentVariables(context)).DB_DATABASE_URL,
    "postgresql://application-user:secret%20from%20manager@localhost:5432/application"
  );
});

test("defines a pg_isready health check that can be overridden", async () => {
  const service = new TestPostgresDockerService({
    name: "db",
    docker: createProvider(),
    password: "secret",
  });
  const disabled = new TestPostgresDockerService({
    name: "disabled-db",
    docker: createProvider(),
    password: "secret",
    healthCheck: false,
  });

  assert.deepEqual(
    (await service.getRunConfig(new DevContext({ stage: "dev" }))).healthCheck,
    {
      command: 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"',
      interval: "10s",
      timeout: "5s",
      retries: 5,
      startPeriod: "10s",
    }
  );
  assert.equal(
    (await disabled.getRunConfig(new DevContext({ stage: "dev" }))).healthCheck,
    false
  );
});

test("applies dbmate migrations on the deployment Docker network", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "saws-postgres-deploy-"));
  const migrationsDirectory = path.join(rootDir, "db", "migrations");
  await mkdir(migrationsDirectory, { recursive: true });
  await writeFile(
    path.join(migrationsDirectory, "20260703120000_create_users.sql"),
    "-- migrate:up\ncreate table users (id bigint primary key);\n\n-- migrate:down\ndrop table users;\n"
  );
  await writeFile(
    path.join(migrationsDirectory, "README.md"),
    "Only SQL migration files should be uploaded.\n"
  );
  const host = new RecordingHost({
    name: "test",
    address: "example.test",
  });
  const service = new PostgresDockerService({
    name: "db",
    docker: new DockerProvider({ host, appDirectory: "/srv/saws" }),
    database: "app",
    username: "app-user",
    password: "secret",
  });

  await service.deploy(
    new DeployContext({ stage: "production", rootDir })
  );

  assert.equal(
    host.copies.some(({ remotePath, contents }) =>
      remotePath ===
        "/srv/saws/production/db/migrations/20260703120000_create_users.sql" &&
      contents.includes("create table users")
    ),
    true
  );
  assert.equal(
    host.copies.some(({ remotePath }) => remotePath.endsWith("README.md")),
    false
  );
  assert.equal(
    host.copies.some(({ remotePath, contents }) =>
      remotePath === "/srv/saws/production/db/migrations.env" &&
      contents ===
        "DATABASE_URL=postgresql://app-user:secret@production-db:5432/app?sslmode=disable\n"
    ),
    true
  );

  const migrationRun = host.commands.find((command) =>
    command.startsWith("docker run --rm")
  );
  assert.match(migrationRun ?? "", /--network 'saws-production'/);
  assert.match(
    migrationRun ?? "",
    /-v '\/srv\/saws\/production\/db\/migrations:\/db\/migrations:ro'/
  );
  assert.match(
    migrationRun ?? "",
    /'ghcr\.io\/amacneil\/dbmate:v2\.33\.0' --wait --no-dump-schema migrate$/
  );
  assert.ok(
    host.commands.findIndex((command) => command.startsWith("docker run --rm")) >
      host.commands.findIndex((command) => command.includes("docker run -d"))
  );
});

test("still runs dbmate when the migrations directory is absent", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "saws-postgres-empty-"));
  const host = new RecordingHost({
    name: "test",
    address: "example.test",
  });
  const service = new PostgresDockerService({
    name: "db",
    docker: new DockerProvider({ host }),
    password: "secret",
    migrationImage: "registry.example.test/dbmate:pinned",
  });

  await service.deploy(
    new DeployContext({ stage: "production", rootDir })
  );

  assert.match(
    host.commands.find((command) => command.startsWith("docker run --rm")) ?? "",
    /'registry\.example\.test\/dbmate:pinned' --wait --no-dump-schema migrate$/
  );
});

test("fails deployment and removes temporary files when migrations fail", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "saws-postgres-fail-"));
  const host = new RecordingHost({
    name: "test",
    address: "example.test",
  });
  host.failMigrations = true;
  const service = new PostgresDockerService({
    name: "db",
    docker: new DockerProvider({ host }),
    password: "secret",
  });

  await assert.rejects(
    service.deploy(new DeployContext({ stage: "production", rootDir })),
    /migration failed/
  );

  assert.equal(
    host.commands.some((command) =>
      command === "rm -f '/opt/saws/production/db/migrations.env'"
    ),
    true
  );
  assert.equal(
    host.commands.at(-1),
    "rm -rf '/opt/saws/production/db/migrations'"
  );
});

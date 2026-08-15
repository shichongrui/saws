import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { ServiceDefinition } from "@saws/core";
import { PowerSyncService } from "../dist/index.js";

class DatabaseStub extends ServiceDefinition {
  constructor(name) {
    super({ name });
    this.deployed = true;
  }

  async getConnectionInfo() {
    return {
      host: this.name,
      port: "5432",
      username: "postgres",
      password: "DATABASE_PASSWORD_SENTINEL",
      database: this.name,
      url: `postgresql://postgres:DATABASE_PASSWORD_SENTINEL@${this.name}:5432/${this.name}`,
    };
  }
}

class HostStub {
  name = "test-host";
  platform = "linux/amd64";
  commands = [];

  async assertReady() {}

  async copyFile() {}

  async exec(command) {
    this.commands.push(command);
  }
}

test("a sync-config-only change changes the deployed PowerSync container label without exposing contents", async () => {
  const originalDirectory = process.cwd();
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "saws-powersync-runtime-"));
  const logs = [];
  const originalLog = console.log;

  try {
    process.chdir(temporaryDirectory);
    console.log = (...values) => logs.push(values.join(" "));
    await mkdir(path.join("powersync", "powersync"), { recursive: true });
    await writeFile(path.join("powersync", "powersync", "service.yaml"), "port: !env PS_PORT\n");
    await writeFile(
      path.join("powersync", "powersync", "sync-config.yaml"),
      "streams: SYNC_CONFIG_SECRET_BEFORE\n",
    );

    const host = new HostStub();
    const service = new PowerSyncService({
      name: "powersync",
      host,
      applicationDatabase: new DatabaseStub("application-db"),
      powersyncDatabase: new DatabaseStub("powersync-db"),
    });

    await service.deploy("production");
    const firstHash = deployedConfigHash(host.commands);
    host.commands.length = 0;

    await writeFile(
      path.join("powersync", "powersync", "sync-config.yaml"),
      "streams: SYNC_CONFIG_SECRET_AFTER\n",
    );
    await service.deploy("production");
    const secondHash = deployedConfigHash(host.commands);

    assert.notEqual(secondHash, firstHash);
    assert.match(host.commands.join("\n"), /docker rm -f/);

    const observableOutput = `${host.commands.join("\n")}\n${logs.join("\n")}`;
    assert.doesNotMatch(observableOutput, /SYNC_CONFIG_SECRET_(?:BEFORE|AFTER)/);
    assert.doesNotMatch(observableOutput, /DATABASE_PASSWORD_SENTINEL/);
  } finally {
    console.log = originalLog;
    process.chdir(originalDirectory);
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

function deployedConfigHash(commands) {
  const match = commands.join("\n").match(/saws\.configHash=([a-f0-9]{64})/);
  assert.ok(match, "expected the Docker run command to contain a config hash label");
  return match[1];
}

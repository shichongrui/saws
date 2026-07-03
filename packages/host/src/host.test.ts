import assert from "node:assert/strict";
import test from "node:test";
import { Host, type HostConfig } from "./host.js";

class RecordingHost extends Host {
  commands: string[] = [];

  constructor(config: HostConfig) {
    super(config);
  }

  override async exec(command: string) {
    this.commands.push(command);
  }
}

test("deploy readiness is a non-mutating marker and Docker check", async () => {
  const host = new RecordingHost({
    name: "home",
    address: "home.example.test",
  });

  await host.assertReady();

  const command = host.commands[0] ?? "";
  assert.match(command, /cat '\/etc\/saws\/host-readiness'/);
  assert.match(command, /command -v docker/);
  assert.match(command, /systemctl is-active --quiet fail2ban/);
  assert.match(command, /saws host configure home/);
  assert.doesNotMatch(command, /apt-get|ufw --force|systemctl enable/);
});

test("explicit configuration installs Docker and applies the exposure policy", async () => {
  const host = new RecordingHost({
    name: "public",
    address: "server.example.test",
    user: "deploy",
    exposure: "public",
    sshPort: 2222,
    allowedTcpPorts: [8443, 443, 443],
  });

  await host.configure();

  const command = host.commands[0] ?? "";
  assert.match(command, /^sudo -n sh -eu -c /);
  assert.match(command, /if ! command -v docker/);
  assert.match(command, /apt-get install -y docker\.io/);
  assert.match(command, /for port in 2222 443 8443; do/);
  assert.match(command, /for port in 443 8443; do/);
  assert.match(command, /host-readiness/);
});

test("a changed exposure policy produces a different readiness marker", async () => {
  const tunnel = new RecordingHost({
    name: "server",
    address: "server.example.test",
  });
  const publicHost = new RecordingHost({
    name: "server",
    address: "server.example.test",
    exposure: "public",
  });

  await tunnel.assertReady();
  await publicHost.assertReady();

  assert.notEqual(tunnel.commands[0], publicHost.commands[0]);
});

test("rejects public ports in tunnel mode and invalid ports", () => {
  assert.throws(
    () => new Host({
      name: "home",
      address: "home.example.test",
      allowedTcpPorts: [443],
    }),
    /cannot allow public TCP ports/
  );
  assert.throws(
    () => new Host({
      name: "server",
      address: "server.example.test",
      exposure: "public",
      allowedTcpPorts: [70_000],
    }),
    /valid TCP ports/
  );
});

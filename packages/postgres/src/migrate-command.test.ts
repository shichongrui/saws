import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  createMigrateCommand,
  migrateCommand,
} from "./migrate-command.js";

test("runs a dbmate command with the project-local executable", async () => {
  const calls: Array<{
    command: string;
    args: string[];
    cwd: string;
  }> = [];

  await migrateCommand(
    ["up"],
    { rootDir: "project" },
    async (command, args, options) => {
      calls.push({ command, args, cwd: options.cwd });
    }
  );

  assert.deepEqual(calls, [{
    command: "npm",
    args: ["exec", "--", "dbmate", "up"],
    cwd: path.resolve("project"),
  }]);
});

test("forwards dbmate subcommands, arguments, and options unchanged", async () => {
  const calls: Array<{ command: string; args: string[] }> = [];
  const command = createMigrateCommand(async (executable, args) => {
    calls.push({ command: executable, args });
  });

  await command.parseAsync([
    "node",
    "saws",
    "--url",
    "postgres://localhost/example",
    "new",
    "create_users",
    "--no-dump-schema",
  ]);

  assert.deepEqual(calls, [{
    command: "npm",
    args: [
      "exec",
      "--",
      "dbmate",
      "--url",
      "postgres://localhost/example",
      "new",
      "create_users",
      "--no-dump-schema",
    ],
  }]);
});

test("forwards help to dbmate", async () => {
  const calls: string[][] = [];
  const command = createMigrateCommand(async (_executable, args) => {
    calls.push(args);
  });

  await command.parseAsync(["node", "saws", "--help"]);

  assert.deepEqual(calls, [["exec", "--", "dbmate", "--help"]]);
});

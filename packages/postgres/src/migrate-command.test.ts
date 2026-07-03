import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { migrateCommand } from "./migrate-command.js";

test("creates a named migration with the project-local dbmate", async () => {
  const calls: Array<{
    command: string;
    args: string[];
    cwd: string;
  }> = [];

  await migrateCommand(
    "create_users",
    { rootDir: "project" },
    async (command, args, options) => {
      calls.push({ command, args, cwd: options.cwd });
    }
  );

  assert.deepEqual(calls, [{
    command: "npm",
    args: ["exec", "--", "dbmate", "new", "create_users"],
    cwd: path.resolve("project"),
  }]);
});

import assert from "node:assert/strict";
import test from "node:test";
import { Command } from "commander";
import { ServiceDefinition } from "./service-definition.js";
import { getServiceCommands } from "./service-commands.js";

class CommandService extends ServiceDefinition {
  static override getCommands() {
    return [new Command("custom")];
  }
}

test("collects commands once per configured service type", () => {
  const shared = new CommandService({ name: "shared" });
  const first = new CommandService({
    name: "first",
    dependencies: [shared],
  });
  const second = new CommandService({
    name: "second",
    dependencies: [shared],
  });
  const root = new ServiceDefinition({
    name: "root",
    dependencies: [first, second],
  });

  assert.deepEqual(
    getServiceCommands(root).map((command) => command.name()),
    ["custom"]
  );
});

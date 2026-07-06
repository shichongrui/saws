import assert from "node:assert/strict";
import test from "node:test";
import { Command } from "commander";
import { ServiceDefinition } from "./service-definition.js";
import { getServiceCommands } from "./service-commands.js";

class CommandService extends ServiceDefinition {
  static configuredNames: string[] = [];

  static override getCommands(services: ServiceDefinition[] = []) {
    this.configuredNames = services.map((service) => service.name);
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
  assert.deepEqual(CommandService.configuredNames, [
    "first",
    "shared",
    "second",
  ]);
});

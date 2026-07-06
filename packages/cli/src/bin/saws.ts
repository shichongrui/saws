#!/usr/bin/env node

process.on("uncaughtException", (e) => {
  console.log(e);
});

import { default as finder } from "find-package-json";
import { Command, program } from "commander";
import { getSawsConfig, ServiceDefinition } from "@saws/core";

import { createCommand as createDevCommand } from "../commands/dev/index.js";
import { createCommand as createDeployCommand } from "../commands/deploy/index.js";
// import { createCommand as createExecuteCommand } from "../commands/execute/index.js";
import { createCommand as createInitCommand } from "../commands/init/index.js";
import { createCommand as createHostCommand } from "../commands/host/index.js";
import { createCommand as createSecretsCommand } from "../commands/secrets/index.js";

const pkg = finder(import.meta.dirname).next().value;

program
  .name("saws")
  .description("A tool for building apps quickly")
  .version(pkg?.version ?? "0.0.0");

program.addCommand(createDevCommand());
program.addCommand(createDeployCommand());
// program.addCommand(createExecuteCommand());
program.addCommand(createInitCommand());
program.addCommand(createHostCommand());
program.addCommand(createSecretsCommand());

type ServiceConstructor = typeof ServiceDefinition & {
  getCommands?: () => Command[];
};

const isInitCommand = process.argv[2] === "init";

if (!isInitCommand) {
  try {
    const service = await getSawsConfig();

    const allServices = [
      ...new Set(
        service.getAllDependencies().map((service) => service.constructor as ServiceConstructor),
      ),
    ];

    for (const serviceClass of allServices) {
      serviceClass.getCommands?.()?.forEach((command) => program.addCommand(command));
    }
  } catch {
    // Project commands are unavailable until a saws.ts file exists.
  }
}

await program.parseAsync(process.argv);

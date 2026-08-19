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
import { createCommand as createLogsCommand } from "../commands/logs/index.js";
import { createCommand as createSecretsCommand } from "../commands/secrets/index.js";
import { createCommand as createAppCommand } from "../commands/app/index.js";

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
program.addCommand(createLogsCommand());
program.addCommand(createSecretsCommand());
program.addCommand(createAppCommand());

type ServiceConstructor = typeof ServiceDefinition & {
  getCommands?: (services?: ServiceDefinition[]) => Command[];
};

const isInitCommand = process.argv[2] === "init";

if (!isInitCommand) {
  try {
    const service = await getSawsConfig();

    const servicesByClass = new Map<ServiceConstructor, ServiceDefinition[]>();
    for (const serviceDefinition of service.getAllDependencies()) {
      const serviceClass = serviceDefinition.constructor as ServiceConstructor;
      servicesByClass.set(serviceClass, [
        ...(servicesByClass.get(serviceClass) ?? []),
        serviceDefinition,
      ]);
    }

    for (const [serviceClass, services] of servicesByClass) {
      serviceClass.getCommands?.(services)?.forEach((command) => program.addCommand(command));
    }
  } catch {
    // Project commands are unavailable until a saws.ts file exists.
  }
}

await program.parseAsync(process.argv);

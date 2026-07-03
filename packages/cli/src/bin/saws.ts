#!/usr/bin/env node

import { program } from "commander";
import { createCommand as createDeployCommand } from "../commands/deploy/index.js";
import { createCommand as createDevCommand } from "../commands/dev/index.js";
import { createCommand as createInitCommand } from "../commands/init/index.js";
import { createCommand as createHostCommand } from "../commands/host/index.js";
import { createCommand as createSecretsCommand } from "../commands/secrets/index.js";
import { access } from "node:fs/promises";
import path from "node:path";
import { getSawsConfig, getServiceCommands } from "@saws/core";

process.on("uncaughtException", (error) => {
  console.error(error);
  process.exitCode = 1;
});

program
  .name("saws")
  .description("Command-line interface for SAWS")
  .version("0.0.0");

program.addCommand(createDevCommand());
program.addCommand(createDeployCommand());
program.addCommand(createInitCommand());
program.addCommand(createHostCommand());
program.addCommand(createSecretsCommand());

await addConfiguredServiceCommands();
await program.parseAsync(process.argv);

async function addConfiguredServiceCommands() {
  const configPath = getConfigOption(process.argv.slice(2));
  if (configPath == null && !(await defaultConfigExists())) return;

  const root = await getSawsConfig(configPath);
  for (const command of getServiceCommands(root)) {
    if (program.commands.some((existing) => existing.name() === command.name())) {
      throw new Error(
        `Service command "${command.name()}" conflicts with an existing SAWS command`
      );
    }
    program.addCommand(command);
  }
}

function getConfigOption(args: string[]) {
  const index = args.indexOf("--config");
  if (index >= 0) return args[index + 1];

  const option = args.find((argument) => argument.startsWith("--config="));
  return option?.slice("--config=".length);
}

async function defaultConfigExists() {
  for (const candidate of ["saws.ts", "saws.js"]) {
    try {
      await access(path.resolve(candidate));
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return false;
}

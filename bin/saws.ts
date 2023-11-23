#!/usr/bin/env node

process.on("uncaughtException", (e) => {
  console.log(e);
});

import finder from "find-package-json";
import { program } from "commander";

import { createCommand as createDevCommand } from "../commands/dev";
import { createCommand as createDeployCommand } from "../commands/deploy";
import { createCommand as createSecretCommand } from "../commands/secret";
import { createCommand as createExecuteCommand } from "../commands/execute";

const pkg = finder(__dirname).next().value;

program
  .name("saws")
  .description("A tool for building apps quickly")
  .version(pkg?.version!);

program.addCommand(createDevCommand());
program.addCommand(createDeployCommand());
program.addCommand(createSecretCommand());
program.addCommand(createExecuteCommand());

program.parse(process.argv);

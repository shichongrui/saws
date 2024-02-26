#!/usr/bin/env node

process.on("uncaughtException", (e) => {
  console.log(e);
});

import { default as finder } from "find-package-json";
import { program } from "commander";

import { createCommand as createDevCommand } from "../src/commands/dev";
import { createCommand as createDeployCommand } from "../src/commands/deploy";
import { createCommand as createSecretCommand } from "../src/commands/secret";
import { createCommand as createExecuteCommand } from "../src/commands/execute";
import { createCommand as createInitCommand } from '../src/commands/init';

const pkg = finder(__dirname).next().value;

program
  .name("saws")
  .description("A tool for building apps quickly")
  .version(pkg?.version!);

program.addCommand(createDevCommand());
program.addCommand(createDeployCommand());
program.addCommand(createSecretCommand());
program.addCommand(createExecuteCommand());
program.addCommand(createInitCommand());

program.parse(process.argv);

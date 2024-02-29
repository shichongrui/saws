#!/usr/bin/env node

process.on("uncaughtException", (e) => {
  console.log(e);
});

import { default as finder } from "find-package-json";
import { program } from "commander";
import { getSawsConfig } from "@saws/core";

import { createCommand as createDevCommand } from "../src/commands/dev";
import { createCommand as createDeployCommand } from "../src/commands/deploy";
import { createCommand as createExecuteCommand } from "../src/commands/execute";
import { createCommand as createInitCommand } from '../src/commands/init';

const pkg = finder(__dirname).next().value;

program
  .name("saws")
  .description("A tool for building apps quickly")
  .version(pkg?.version!);

program.addCommand(createDevCommand());
program.addCommand(createDeployCommand());
program.addCommand(createExecuteCommand());
program.addCommand(createInitCommand());

(async () => {
  const service = await getSawsConfig()

  const allServices = [...new Set(service.getAllDependencies().map(service => service.constructor))]

  for (const serviceClass of allServices) {
    // @ts-expect-error Not all classes will define a getCommands static method
    serviceClass.getCommands?.()?.forEach(command => program.addCommand(command))
  }

  program.parse(process.argv);
})()

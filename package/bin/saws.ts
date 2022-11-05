#!/usr/bin/env ts-node

import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";
import { startDev } from "../cli/commands/dev";
import { deploy } from "../cli/commands/deploy";
import { startGraphiql } from "../cli/commands/graphiql";
import { secret } from "../cli/commands/secret";
// import { create } from "../cli/commands/create";

yargs(hideBin(process.argv))
  .command("dev", "start dev", () => {
    startDev().catch((err) => console.error(err));
  })
  // .command(
  //   "create <createType> [name]",
  //   "Create things",
  //   (yargs) => yargs.options({
  //     name: {
  //       string: true,
  //     },
  //     createType: {
  //       string: true,
  //       requiresArg: true,
  //       demandOption: true,
  //       choices: ['migration']
  //     }
  //   }),
  //   (argv) => create(argv.createType, argv.name).catch(err => console.error(err))
  // )
  .command(
    "deploy",
    "deploy",
    (yargs) => {
      return yargs.options({
        stage: {
          requiresArg: true,
          string: true,
          demandOption: true,
        },
      });
    },
    (argv) => {
      deploy(argv.stage).catch((err) => console.error(err));
    }
  )
  .command(
    "graphiql",
    "start graphiql pointing at prod",
    (yargs) => {
      return yargs.options({
        stage: {
          requiresArg: true,
          string: true,
          demandOption: true,
        },
      });
    },
    (argv) => {
      startGraphiql(argv.stage).catch((err) => console.error(err));
    }
  )
  .command(
    "secrets <getOrSet> <name>",
    "manage secrets",
    (yargs) => {
      return yargs.options({
        getOrSet: {
          string: true,
          requiresArg: true,
          demandOption: true,
          choices: ["get", "set"] as const,
        },
        name: {
          string: true,
          demandOption: true,
          requiresArg: true,
        },
        stage: {
          string: true,
        },
      });
    },
    (argv) => {
      secret(argv.stage, argv.getOrSet, argv.name).catch((err) =>
        console.error(err)
      );
    }
  )
  .parse();

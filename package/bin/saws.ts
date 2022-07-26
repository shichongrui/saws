#!/usr/bin/env ts-node

import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";
import { startDev } from "../cli/commands/dev";
import { deploy } from "../cli/commands/deploy";
import { startGraphiql } from "../cli/commands/graphiql";
import { secret } from "../cli/commands/secret";
import { startStudio } from "../cli/commands/studio";
import { create } from "../cli/commands/create";

yargs(hideBin(process.argv))
  .command(
    "dev",
    "start dev",
    (yargs) =>
      yargs.options({
        stage: {
          string: true,
          default: "local",
        },
      }),
    (argv) => {
      startDev(argv.stage).catch((err) => console.error(err));
    }
  )
  .command(
    "create <createType>",
    "Create things",
    (yargs) => yargs.options({
      name: {
        string: true,
      },
      createType: {
        string: true,
        requiresArg: true,
        demandOption: true,
        choices: ['migration']
      }
    }),
    (argv) => create(argv.createType, argv.name).catch(err => console.error(err))
  )
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
    "studio",
    "start Prisma studio",
    (yargs) => {
      return yargs.options({
        stage: {
          string: true,
        },
      });
    },
    (argv) => {
      startStudio(argv.stage);
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

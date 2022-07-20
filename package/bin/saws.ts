#!/usr/bin/env ts-node

import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";
import { startDev } from "../cli/commands/dev";
import { deploy } from "../cli/commands/deploy";
import { startGraphiql } from "../cli/commands/graphiql";
import { secret } from "../cli/commands/secret";
import { startStudio } from "../cli/commands/studio";

yargs(hideBin(process.argv))
  .command(
    "dev",
    "start dev",
    (yargs) =>
      yargs.option({
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
          requiresArg: true,
          string: true,
          demandOption: true,
        },
      });
    },
    (argv) => {
      startStudio(argv.stage);
    }
  )
  .command(
    "secret",
    "set secret",
    (yargs) => {
      return yargs.options({
        stage: {
          string: true,
        },
      });
    },
    (argv) => {
      secret(argv.stage).catch((err) => console.error(err));
    }
  )
  .parse();

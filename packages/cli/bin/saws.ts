#!/usr/bin/env ts-node

import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";
import { startDev } from "../cli/commands/dev";
import { deploy } from "../cli/commands/deploy";
import { startGraphiql } from "../cli/commands/graphiql";
import { secret } from "../cli/commands/secret";
import { migrate } from "../cli/commands/migrate";
import { execute } from "../cli/commands/execute";
import { dbPush } from "../cli/commands/db-push";

yargs(hideBin(process.argv))
  .command("dev", "start dev", () => {
    startDev().catch((err) => console.error(err));
  })
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
  .command(
    "migrate",
    "migrate the db",
    () => {
      migrate().catch((err) => console.error(err))
    }
  )
  .command(
    "db push",
    "push schema changes to the db",
    () => {
      dbPush().catch((err) => console.error(err))
    }
  )
  .command(
    "execute <path>",
    "execute a script",
    (yargs) => {
      return yargs.options({
        path: {
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
      execute(argv.path, argv.stage).catch((err) => console.error(err))
    }
  )
  .parse();

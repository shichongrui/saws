#!/usr/bin/env ts-node

import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";
import { startDev } from "../commands/dev";
import { deploy } from "../commands/deploy";
import { startGraphiql } from "../commands/graphiql";
import { secret } from "../commands/secret";
import { startStudio } from "../commands/studio";

yargs(hideBin(process.argv))
  .command(
    "dev [entrypoint]",
    "start dev",
    (yargs) => {
      return yargs.positional("entrypoint", {
        describe: "entrypoint for your saws api",
      })
    },
    (argv) => {
      startDev(argv.entrypoint as string).catch((err) => console.error(err));
    }
  )
  .command(
    "deploy [entrypoint]",
    "deploy",
    (yargs) => {
      return yargs.positional("entrypoint", {
        describe: "entrypoint for your saws api",
      }).options({
        stage: {
          requiresArg: true,
          string: true,
          demandOption: true,
        }
      });;
    },
    (argv) => {
      deploy(argv.entrypoint as string, argv.stage).catch((err) => console.error(err));
    }
  )
  .command("graphiql", "start graphiql pointing at prod", (yargs) => {
    return yargs.options({
      stage: {
        requiresArg: true,
        string: true,
        demandOption: true,
      }
    })
  }, (argv) => {
    startGraphiql(argv.stage).catch((err) => console.error(err));
  })
  .command("studio", "start Prisma studio", (yargs) => {
    return yargs.options({
      stage: {
        requiresArg: true,
        string: true,
        demandOption: true,
      }
    })
  }, (argv) => {
    startStudio(argv.stage);
  })
  .command("secret", "set secret", () => {
    secret().catch((err) => console.error(err));
  })
  .parse();

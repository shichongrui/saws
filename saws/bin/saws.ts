#!/usr/bin/env ts-node

import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";
import { startDev } from "../commands/dev";
import { deploy } from "../commands/deploy";
import { startGraphiql } from "../commands/graphiql";
import { secret } from "../commands/secret";
import { startStudio } from "../commands/studio";
import { getEntrypoint } from "../src/utils/get-entrypoint";

yargs(hideBin(process.argv))
  .command(
    "dev",
    "start dev",
    (yargs) => yargs.option({
      stage: {
        string: true,
        default: 'local',
      }
    }),
    (argv) => {
      const entrypoint = getEntrypoint();
      startDev(entrypoint, argv.stage).catch((err) => console.error(err));
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
        }
      });;
    },
    (argv) => {
      deploy(getEntrypoint(), argv.stage).catch((err) => console.error(err));
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
  .command("secret", "set secret", (yargs) => {
    return yargs.options({
      stage: {
        string: true,
      }
    })
  },
  (argv) => {
    secret(argv.stage).catch((err) => console.error(err));
  })
  .parse();

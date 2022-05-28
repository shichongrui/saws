#!/usr/bin/env ts-node

import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";
import { startDev } from "./commands/dev";
import { deploy } from "./commands/deploy";
import { startGraphiql } from "./commands/graphiql";

yargs(hideBin(process.argv))
  .command(
    "dev [entrypoint]",
    "start dev",
    (yargs) => {
      return yargs.positional("entrypoint", {
        describe: "entrypoint for your saws api",
      });
    },
    (argv) => {
      startDev(argv.entrypoint as string);
    }
  )
  .command(
    "deploy [entrypoint]",
    "deploy",
    (yargs) => {
      return yargs.positional("entrypoint", {
        describe: "entrypoint for your saws api",
      });
    },
    (argv) => {
      deploy(argv.entrypoint as string);
    }
  )
  .command(
    "graphiql",
    "start graphiql pointing at prod",
    (argv) => {
      startGraphiql();
    }
  )
  .parse();

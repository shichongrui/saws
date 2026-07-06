import { Command } from "commander";
import { configureHostCommand } from "./command.js";

export const createCommand = () =>
  new Command("host")
    .description("configure deployment hosts")
    .addCommand(
      new Command("configure")
        .description("bootstrap a deployment user and apply host security policy")
        .argument("[name]", "host name; optional when exactly one host exists")
        .requiredOption(
          "--user <bootstrap-user>",
          "existing SSH account used for initial configuration",
        )
        .option("--config <path>", "path to saws.ts")
        .option("--dry-run", "describe configuration without making changes")
        .action(configureHostCommand),
    );

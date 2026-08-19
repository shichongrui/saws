import { Command } from "commander";
import { configureHostCommand } from "./command.js";
import { createHostCommand } from "./create.js";
import { importHostKeyCommand } from "./import-key.js";

export const createCommand = () =>
  new Command("host")
    .description("configure deployment hosts")
    .addCommand(
      new Command("create")
        .description("create a global deployment host")
        .argument("<name>", "global host name")
        .requiredOption("--address <address>", "host name or IP address")
        .requiredOption("--user <deployment-user>", "persistent deployment account")
        .option("--ssh-port <port>", "SSH port")
        .option("--platform <platform>", 'Docker platform such as "linux/amd64"')
        .option("--exposure <mode>", 'network exposure policy: "tunnel" or "public"')
        .option("--allowed-tcp-port <port...>", "public TCP ports allowed by the host firewall")
        .action(createHostCommand),
    )
    .addCommand(
      new Command("key")
        .description("manage global host deployment keys")
        .addCommand(
          new Command("import")
            .description("import an existing private key into encrypted global storage")
            .argument("<name>", "global host name")
            .requiredOption("--file <path>", "path to an SSH private key")
            .option("--force", "replace an existing deployment key")
            .action(importHostKeyCommand),
        ),
    )
    .addCommand(
      new Command("configure")
        .description("bootstrap a deployment user and apply host security policy")
        .argument("[name]", "host name; optional when exactly one host exists")
        .requiredOption(
          "--user <bootstrap-user>",
          "existing SSH account used for initial configuration",
        )
        .option("--config <path>", "path to saws.ts")
        .option("--global", "configure a host from the global host registry")
        .option("--dry-run", "describe configuration without making changes")
        .action(configureHostCommand),
    );

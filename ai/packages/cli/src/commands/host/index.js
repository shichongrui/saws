import { Command } from "commander";
import { configureHostCommand } from "./command.js";
export const createCommand = () => new Command("host")
    .description("configure deployment hosts")
    .addCommand(new Command("configure")
    .description("install Docker and apply the configured security policy")
    .argument("[name]", "host name; optional when exactly one host exists")
    .option("--config <string>", "path to service definition")
    .option("--dry-run", "print the remote configuration command")
    .action(configureHostCommand));

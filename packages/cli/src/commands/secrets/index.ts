import { Command } from "commander";
import { secretsCommand } from "./command.js";

export const createCommand = () =>
  new Command("secrets")
    .description("get or set encrypted SAWS secrets")
    .argument("<name>", "secret name")
    .option("--stage <string>", "stage for a stage-scoped secret", "local")
    .option("--global", "use the machine-global secret scope")
    .option("--set <string>", "set the secret value")
    .option("--get", "get the secret value")
    .option("--config <string>", "path to service definition")
    .action(secretsCommand);

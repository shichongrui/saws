import { Command } from "commander";
import { secretsCommand } from "./command.js";

export const createCommand = () =>
  new Command("secrets")
    .argument("<string>", "secret name")
    .option("--stage <string>", "stage", "local")
    .option("--set <string>", "set secret value")
    .option("--get", "get secret value")
    .option("--root-dir <string>", "project root used for local secrets")
    .action(secretsCommand);

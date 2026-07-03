import { Command } from "commander";
import { deployCommand } from "./command.js";

export const createCommand = () =>
  new Command("deploy")
    .argument("[string]", "path to service definition")
    .requiredOption("--stage <string>", "stage to deploy")
    .option("--dry-run", "print remote commands instead of executing them")
    .option("--root-dir <string>", "project root used for generated local files")
    .option("--config <string>", "path to service definition")
    .action(deployCommand);

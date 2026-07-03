import { Command } from "commander";
import { devCommand } from "./command.js";

export const createCommand = () =>
  new Command("dev")
    .argument("[string]", "path to service definition")
    .option("--dry-run", "print local Docker commands instead of executing them")
    .option("--root-dir <string>", "project root used for generated local files")
    .option("--config <string>", "path to service definition")
    .action(devCommand);

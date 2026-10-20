import { Command } from "commander";
import { devCommand } from "./command.js";

export const createCommand = () =>
  new Command("dev")
    .argument("[path]", "path to service definition", "./saws.ts")
    .option("--no-tui", "run process-compose without its terminal UI")
    .option("--dry-run", "generate the process-compose configuration without starting services")
    .action(devCommand);

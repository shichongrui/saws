import { Command } from "commander";
import { logsCommand } from "./command.js";

export const createCommand = () =>
  new Command("logs")
    .option("--stage <string>", "stage to tail logs from")
    .option("--config <path>", "path to service definition")
    .argument("[service]", "name of the service to tail logs from")
    .action(logsCommand);

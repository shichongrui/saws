import { Command } from "commander";
import { deployCommand } from "./command";

export const createCommand = () =>
  new Command("deploy")
    .option("--stage <string>", "stage to deploy")
    .argument("[string]", "path to service definition")
    .action(deployCommand);

import { Command } from "commander";
import { deployCommand } from "./command.js";

export const createCommand = () =>
  new Command("deploy")
    .option("--stage <string>", "stage to deploy")
    .option("--name <name>", "service to deploy with its dependencies")
    .argument("[string]", "path to service definition")
    .action(deployCommand);

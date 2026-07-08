import { Command } from "commander";
import { initCommand } from "./command.js";

export const createCommand = () =>
  new Command("init")
    .argument("[service]", "name of the service to initialize")
    .argument("[config]", "path to service definition")
    .action(initCommand);

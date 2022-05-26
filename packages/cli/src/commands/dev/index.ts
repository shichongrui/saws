import { Command } from "commander";
import { devCommand } from "./command";

export const createCommand = () =>
  new Command("dev")
    .argument("[string]", "path to service definition")
    .action(devCommand);

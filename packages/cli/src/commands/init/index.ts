import { Command } from "commander";
import { initCommand } from "./command";

export const createCommand = () =>
  new Command("init")
    .action(initCommand);

import { Command } from "commander";
import { executeCommand } from "./command";

export const createCommand = () =>
  new Command("execute")
    .option("--stage <string>", "Stage")
    .argument("<string>", "The path to the saws file")
    .argument("<string>", "The path to the script to execute")
    .action(executeCommand);

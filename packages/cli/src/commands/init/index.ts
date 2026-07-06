import { Command } from "commander";
import { initCommand } from "./command.js";

export const createCommand = () => new Command("init").action(initCommand);

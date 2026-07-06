import { Command } from "commander";
import { devCommand } from "./command.js";

export const createCommand = () =>
  new Command("dev").argument("[string]", "path to service definition").action(devCommand);

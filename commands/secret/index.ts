import { Command } from "commander";
import { secretCommand } from "./command";

export const createCommand = () =>
  new Command("secret")
    .option("--stage <string>", "Stage")
    .option("--set <string>", "Set a secret as value")
    .option("--get", "Get a secret")
    .argument("[string]", "The name of the secret")
    .action(secretCommand);

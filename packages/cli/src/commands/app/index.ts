import { Command } from "commander";
import { deployAppCommand } from "./deploy.js";
import { installAppCommand } from "./install.js";

export const createCommand = () =>
  new Command("app")
    .description("install and deploy packaged SAWS applications")
    .addCommand(
      new Command("install")
        .description("install a packaged SAWS application")
        .argument("<package>", "npm package name with an optional version or tag")
        .requiredOption("--name <name>", "local name for this application instance")
        .requiredOption("--config <path>", "TypeScript module containing the factory input")
        .action(installAppCommand),
    )
    .addCommand(
      new Command("deploy")
        .description("deploy an installed SAWS application")
        .argument("<name>", "installed application name")
        .requiredOption("--stage <stage>", "stage to deploy")
        .action(deployAppCommand),
    );

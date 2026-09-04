import { Command } from "commander";
import { deployAppCommand } from "./deploy.js";
import { installAppCommand } from "./install.js";
import { listAppsCommand } from "./list.js";
import { updateAppCommand } from "./update.js";

export const createCommand = () =>
  new Command("app")
    .description("manage packaged SAWS applications")
    .addCommand(
      new Command("list").description("list installed SAWS applications").action(listAppsCommand),
    )
    .addCommand(
      new Command("install")
        .description("install a packaged SAWS application")
        .argument("<package>", "npm package name with an optional version or tag")
        .requiredOption("--name <name>", "local name for this application instance")
        .action(installAppCommand),
    )
    .addCommand(
      new Command("update")
        .description("update an installed SAWS application to npm latest")
        .argument("<name>", "installed application name")
        .action(updateAppCommand),
    )
    .addCommand(
      new Command("deploy")
        .description("deploy an installed SAWS application")
        .argument("<name>", "installed application name")
        .requiredOption("--stage <stage>", "stage to deploy")
        .action(deployAppCommand),
    );

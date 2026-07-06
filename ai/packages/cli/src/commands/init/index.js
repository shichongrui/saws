import { Command } from "commander";
import { initCommand } from "./command.js";
export const createCommand = () => new Command("init")
    .description("bootstrap one configured service and its dependencies")
    .argument("<service>", "name of the service to initialize")
    .argument("[config]", "path to service definition")
    .option("--root-dir <string>", "project root used for generated files")
    .option("--config <string>", "path to service definition")
    .option("--dry-run", "allow service initializers to preview their changes")
    .action(initCommand);

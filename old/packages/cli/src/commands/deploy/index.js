"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCommand = void 0;
const commander_1 = require("commander");
const command_1 = require("./command");
const createCommand = () => new commander_1.Command("deploy")
    .option("--stage <string>", "stage to deploy")
    .argument("[string]", "path to service definition")
    .action(command_1.deployCommand);
exports.createCommand = createCommand;

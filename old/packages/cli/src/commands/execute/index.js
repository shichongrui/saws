"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCommand = void 0;
const commander_1 = require("commander");
const command_1 = require("./command");
const createCommand = () => new commander_1.Command("execute")
    .option("--stage <string>", "Stage")
    .argument("<string>", "The path to the script to execute")
    .argument("[string]", "The path to the saws file")
    .action(command_1.executeCommand);
exports.createCommand = createCommand;

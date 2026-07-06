"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCommand = void 0;
const commander_1 = require("commander");
const command_1 = require("./command");
const createCommand = () => new commander_1.Command("init")
    .action(command_1.initCommand);
exports.createCommand = createCommand;

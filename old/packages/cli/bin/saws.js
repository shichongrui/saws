#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
process.on("uncaughtException", (e) => {
    console.log(e);
});
const find_package_json_1 = __importDefault(require("find-package-json"));
const commander_1 = require("commander");
const core_1 = require("@saws/core");
const dev_1 = require("../src/commands/dev");
const deploy_1 = require("../src/commands/deploy");
const execute_1 = require("../src/commands/execute");
const init_1 = require("../src/commands/init");
const pkg = (0, find_package_json_1.default)(__dirname).next().value;
commander_1.program
    .name("saws")
    .description("A tool for building apps quickly")
    .version(pkg?.version);
commander_1.program.addCommand((0, dev_1.createCommand)());
commander_1.program.addCommand((0, deploy_1.createCommand)());
commander_1.program.addCommand((0, execute_1.createCommand)());
commander_1.program.addCommand((0, init_1.createCommand)());
(async () => {
    try {
        const service = await (0, core_1.getSawsConfig)();
        const allServices = [...new Set(service.getAllDependencies().map(service => service.constructor))];
        for (const serviceClass of allServices) {
            // @ts-expect-error Not all classes will define a getCommands static method
            serviceClass.getCommands?.()?.forEach(command => commander_1.program.addCommand(command));
        }
    }
    catch (_err) {
        // It's possible for there not to be a saws.js file yet and thus this will fail
    }
    finally {
        commander_1.program.parse(process.argv);
    }
})();

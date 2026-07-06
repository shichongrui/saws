"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.devCommand = void 0;
const create_directories_1 = require("@saws/utils/create-directories");
const on_exit_1 = require("@saws/utils/on-exit");
const core_1 = require("@saws/core");
const devCommand = async (path) => {
    process.env.NODE_ENV = "development";
    process.env.STAGE = "local";
    process.env.AWS_REGION = 'us-west-2';
    await (0, create_directories_1.createCacheDir)();
    const serviceDefinition = await (0, core_1.getSawsConfig)(path);
    (0, on_exit_1.onProcessExit)(() => {
        serviceDefinition.exit();
    });
    await serviceDefinition.dev();
    serviceDefinition.forEachDependency(async (dependency) => {
        dependency.getStdOut()?.pipe(process.stdout);
    });
};
exports.devCommand = devCommand;

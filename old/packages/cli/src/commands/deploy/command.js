"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deployCommand = void 0;
const create_directories_1 = require("@saws/utils/create-directories");
const core_1 = require("@saws/core");
const deployCommand = async (path, { stage }) => {
    if (stage === "local") {
        console.warn("Can not deploy to local stage");
        process.exit();
    }
    await (0, create_directories_1.createCacheDir)();
    const serviceDefinition = await (0, core_1.getSawsConfig)(path);
    await serviceDefinition.deploy(stage);
};
exports.deployCommand = deployCommand;

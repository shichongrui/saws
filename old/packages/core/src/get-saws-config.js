"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSawsConfig = getSawsConfig;
const path_1 = require("path");
async function getSawsConfig(path = './saws.js') {
    const pathToConfig = (0, path_1.resolve)(path);
    const serviceDefinition = await import(pathToConfig);
    return serviceDefinition.default;
}

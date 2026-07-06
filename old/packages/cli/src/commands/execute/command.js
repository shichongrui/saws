"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeCommand = void 0;
const core_1 = require("@saws/core");
const constants_1 = require("@saws/utils/constants");
const stage_outputs_1 = require("@saws/utils/stage-outputs");
const child_process_1 = require("child_process");
const esbuild_1 = __importDefault(require("esbuild"));
const path_1 = __importDefault(require("path"));
const executeCommand = async (scriptPath, sawsPath, { stage = "local" }) => {
    process.env.STAGE = stage;
    const serviceDefinition = await (0, core_1.getSawsConfig)(sawsPath);
    const stageOutputs = await (0, stage_outputs_1.getStageOutputs)(stage);
    const services = serviceDefinition.getAllDependencies();
    let environment = {
        NODE_ENV: stage === "local" ? "development" : "production",
        STAGE: stage,
    };
    for (const service of services) {
        await service.setOutputs(stageOutputs[service.name], stage);
        environment = {
            ...environment,
            ...await (service.getEnvironmentVariables(stage))
        };
    }
    const outFile = path_1.default.join(constants_1.BUILD_DIR, "script.js");
    await esbuild_1.default.build({
        entryPoints: [scriptPath],
        bundle: true,
        outfile: outFile,
        platform: "node",
    });
    (0, child_process_1.fork)(outFile, {
        env: environment,
    });
};
exports.executeCommand = executeCommand;

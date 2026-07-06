"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeStageOutputs = exports.getStageOutputs = void 0;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const constants_1 = require("./constants");
const getStageOutputs = async (stage) => {
    const outputPath = path_1.default.resolve(constants_1.SAWS_DIR, `saws-${stage}-output.json`);
    try {
        await fs_1.promises.stat(outputPath);
        const outputsText = await fs_1.promises.readFile(outputPath, { encoding: "utf-8" });
        return JSON.parse(outputsText);
    }
    catch (err) {
        return {};
    }
};
exports.getStageOutputs = getStageOutputs;
const writeStageOutputs = async (newOutputs, stage) => {
    const currentOutputs = await (0, exports.getStageOutputs)(stage);
    // write outputs
    const outputs = {
        ...currentOutputs,
        ...newOutputs,
    };
    await fs_1.promises.writeFile(path_1.default.resolve(constants_1.SAWS_DIR, `saws-${stage}-output.json`), JSON.stringify(outputs, null, 2));
    return outputs;
};
exports.writeStageOutputs = writeStageOutputs;

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createFileIfNotExists = void 0;
const node_fs_1 = __importDefault(require("node:fs"));
const createFileIfNotExists = (path, fileContents) => {
    if (node_fs_1.default.existsSync(path))
        return;
    console.log('Writing', path);
    node_fs_1.default.writeFileSync(path, fileContents);
};
exports.createFileIfNotExists = createFileIfNotExists;

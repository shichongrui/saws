"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recursivelyReadDir = void 0;
const fs_1 = require("fs");
const path_1 = require("path");
const recursivelyReadDir = async (path) => {
    const files = [];
    const dirContents = await fs_1.promises.readdir(path, { withFileTypes: true });
    for (const item of dirContents) {
        if (item.isDirectory()) {
            const nestedFiles = await (0, exports.recursivelyReadDir)((0, path_1.resolve)(path, item.name));
            files.push(...nestedFiles);
            continue;
        }
        files.push((0, path_1.resolve)(path, item.name));
    }
    return files;
};
exports.recursivelyReadDir = recursivelyReadDir;

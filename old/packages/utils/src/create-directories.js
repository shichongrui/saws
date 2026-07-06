"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSawsDir = exports.createCacheDir = void 0;
const node_fs_1 = require("node:fs");
const constants_1 = require("./constants");
const createCacheDir = async () => {
    // check if the cache dir exists already or not
    // if not create it
    try {
        await node_fs_1.promises.access(constants_1.BUILD_DIR, node_fs_1.constants.F_OK);
    }
    catch (err) {
        await node_fs_1.promises.mkdir(constants_1.BUILD_DIR, { recursive: true });
    }
};
exports.createCacheDir = createCacheDir;
const createSawsDir = async () => {
    try {
        await node_fs_1.promises.access(constants_1.SAWS_DIR, node_fs_1.constants.F_OK);
    }
    catch (err) {
        await node_fs_1.promises.mkdir(constants_1.SAWS_DIR, { recursive: true });
    }
};
exports.createSawsDir = createSawsDir;

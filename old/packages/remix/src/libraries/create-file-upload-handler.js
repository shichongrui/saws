"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createFileUploadHandler = createFileUploadHandler;
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const promises_1 = require("node:fs/promises");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const node_stream_1 = require("node:stream");
const node_util_1 = require("node:util");
const server_runtime_1 = require("@remix-run/server-runtime");
let defaultFilePathResolver = ({ filename }) => {
    let ext = filename ? (0, node_path_1.extname)(filename) : "";
    return "upload_" + (0, node_crypto_1.randomBytes)(4).readUInt32LE(0) + ext;
};
function createFileUploadHandler({ directory = (0, node_os_1.tmpdir)(), file = defaultFilePathResolver, maxPartSize = 3000000, } = {}) {
    return async ({ name, filename, contentType, data }) => {
        if (!filename) {
            return undefined;
        }
        let filedir = (0, node_path_1.resolve)(directory);
        let path = typeof file === "string" ? file : file({ name, filename, contentType });
        if (!path) {
            return undefined;
        }
        let filepath = (0, node_path_1.resolve)(filedir, path);
        await (0, promises_1.mkdir)((0, node_path_1.dirname)(filepath), { recursive: true }).catch(() => { });
        let writeFileStream = (0, node_fs_1.createWriteStream)(filepath);
        let size = 0;
        let deleteFile = false;
        try {
            for await (let chunk of data) {
                size += chunk.byteLength;
                if (size > maxPartSize) {
                    deleteFile = true;
                    throw new server_runtime_1.MaxPartSizeExceededError(name, maxPartSize);
                }
                writeFileStream.write(chunk);
            }
        }
        finally {
            writeFileStream.end();
            await (0, node_util_1.promisify)(node_stream_1.finished)(writeFileStream);
            if (deleteFile) {
                await (0, promises_1.rm)(filepath).catch(() => { });
            }
        }
        return filepath;
    };
}

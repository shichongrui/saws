"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.multipartFormData = void 0;
const node_1 = require("@remix-run/node");
const create_file_upload_handler_1 = require("./create-file-upload-handler");
const multipartFormData = (request) => {
    return (0, node_1.unstable_parseMultipartFormData)(request, (0, node_1.unstable_composeUploadHandlers)((0, create_file_upload_handler_1.createFileUploadHandler)({
        maxPartSize: 5_000_000,
        file: ({ filename }) => filename,
    }), (0, node_1.unstable_createMemoryUploadHandler)()));
};
exports.multipartFormData = multipartFormData;

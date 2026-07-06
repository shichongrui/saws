"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.collectHttpBody = void 0;
const collectHttpBody = async (req) => {
    return new Promise((resolve) => {
        if (req.method !== "POST") {
            resolve(undefined);
            return;
        }
        const dataChunks = [];
        req.on("data", function (chunk) {
            dataChunks.push(chunk);
        });
        req.on("end", function () {
            let buffer = Buffer.concat(dataChunks);
            resolve(buffer.toString('base64'));
        });
    });
};
exports.collectHttpBody = collectHttpBody;

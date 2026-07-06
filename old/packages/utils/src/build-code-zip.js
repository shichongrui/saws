"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildCodeZip = void 0;
const node_path_1 = __importDefault(require("node:path"));
const node_crypto_1 = __importDefault(require("node:crypto"));
const adm_zip_1 = __importDefault(require("adm-zip"));
const constants_1 = require("./constants");
const node_fs_1 = require("node:fs");
const buildCodeZip = async (modulePath, { name, include = [], hasExternalModules = false, includePrisma = false, }) => {
    const zip = new adm_zip_1.default();
    zip.addLocalFile(modulePath);
    const parsedModulePath = node_path_1.default.parse(modulePath);
    const sourceMapPath = node_path_1.default.join(parsedModulePath.dir, `${parsedModulePath.name}.js.map`);
    zip.addLocalFile(sourceMapPath);
    // add externals
    if (hasExternalModules) {
        zip.addLocalFolder(node_path_1.default.resolve(parsedModulePath.dir, "node_modules"), "node_modules");
    }
    if (include.length > 0) {
        for (const filePath of include) {
            const fullPath = node_path_1.default.resolve(parsedModulePath.dir, filePath);
            const stat = await node_fs_1.promises.stat(fullPath);
            if (stat.isDirectory()) {
                zip.addLocalFolder(fullPath, filePath);
            }
            else {
                const directory = node_path_1.default.parse(filePath).dir;
                zip.addLocalFile(fullPath, directory);
            }
        }
    }
    if (includePrisma) {
        zip.addLocalFile(node_path_1.default.resolve("node_modules", ".prisma", "client", "libquery_engine-rhel-openssl-3.0.x.so.node"), "node_modules/.prisma/client");
        zip.addLocalFile(node_path_1.default.resolve("prisma", "schema.prisma"), "node_modules/.prisma/client");
    }
    // If we don't clear the dates on each entry, then we get a different hash each time
    // even if all of the file contents are the same
    zip.getEntries().forEach((e) => (e.header.time = new Date("2022-06-17")));
    const hash = node_crypto_1.default.createHash("md5").update(zip.toBuffer()).digest("hex");
    const key = `${name}-${hash}.zip`;
    const zipPath = node_path_1.default.resolve(constants_1.BUILD_DIR, key);
    await zip.writeZipPromise(zipPath);
    return zipPath;
};
exports.buildCodeZip = buildCodeZip;

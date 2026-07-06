"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initCommand = void 0;
const node_path_1 = __importDefault(require("node:path"));
const dependency_management_1 = require("@saws/utils/dependency-management");
const tsconfig_json_template_1 = require("./templates/tsconfig-json.template");
const saws_js_template_1 = require("./templates/saws-js.template");
const create_file_if_not_exists_1 = require("@saws/utils/create-file-if-not-exists");
const gitignore_template_1 = require("./templates/gitignore.template");
const initCommand = async () => {
    const name = node_path_1.default.parse(node_path_1.default.resolve('.')).name;
    // not used for now
    await (0, dependency_management_1.installMissingDependencies)([]);
    await (0, dependency_management_1.installMissingDependencies)(['@saws/core', 'typescript'], { development: true });
    (0, create_file_if_not_exists_1.createFileIfNotExists)('./tsconfig.json', (0, tsconfig_json_template_1.tsconfigJsonTemplate)());
    (0, create_file_if_not_exists_1.createFileIfNotExists)('./saws.js', (0, saws_js_template_1.sawsJsTemplate)({ name }));
    (0, create_file_if_not_exists_1.createFileIfNotExists)('./.gitignore', (0, gitignore_template_1.gitignoreTemplate)());
};
exports.initCommand = initCommand;

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RestApiService = void 0;
const dependency_management_1 = require("@saws/utils/dependency-management");
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const ApiService_1 = require("./ApiService");
const create_file_if_not_exists_1 = require("@saws/utils/create-file-if-not-exists");
const rest_api_entrypoint_template_1 = require("./templates/rest-api-entrypoint.template");
class RestApiService extends ApiService_1.ApiService {
    async init() {
        const requiredDependencies = ['express'];
        await (0, dependency_management_1.installMissingDependencies)(requiredDependencies);
        node_fs_1.default.mkdirSync(node_path_1.default.resolve(this.name), { recursive: true });
        (0, create_file_if_not_exists_1.createFileIfNotExists)(node_path_1.default.resolve(this.name, 'index.ts'), (0, rest_api_entrypoint_template_1.restApiEntrypointTemplate)());
    }
}
exports.RestApiService = RestApiService;

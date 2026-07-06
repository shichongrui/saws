"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GraphQLApiService = void 0;
const dependency_management_1 = require("@saws/utils/dependency-management");
const ApiService_1 = require("./ApiService");
const create_file_if_not_exists_1 = require("@saws/utils/create-file-if-not-exists");
const graphql_api_entrypoint_template_1 = require("./templates/graphql-api-entrypoint.template");
const node_path_1 = __importDefault(require("node:path"));
const node_fs_1 = __importDefault(require("node:fs"));
const graphql_hello_world_index_template_1 = require("./templates/graphql-hello-world-index.template");
class GraphQLApiService extends ApiService_1.ApiService {
    async init() {
        const requiredDependencies = ['@graphql-tools/merge', 'graphql', 'apollo-server-lambda', '@graphql-tools/schema'];
        await (0, dependency_management_1.installMissingDependencies)(requiredDependencies);
        node_fs_1.default.mkdirSync(node_path_1.default.resolve(this.name, 'hello-world'), { recursive: true });
        (0, create_file_if_not_exists_1.createFileIfNotExists)(node_path_1.default.resolve(this.name, 'index.ts'), (0, graphql_api_entrypoint_template_1.graphqlApiEntrypointTemplate)());
        (0, create_file_if_not_exists_1.createFileIfNotExists)(node_path_1.default.resolve(this.name, 'hello-world', 'index.ts'), (0, graphql_hello_world_index_template_1.graphqlHelloWorldIndexTemplate)());
    }
}
exports.GraphQLApiService = GraphQLApiService;

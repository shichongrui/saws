"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FunctionService = void 0;
const path_1 = __importDefault(require("path"));
const core_1 = require("@saws/core");
const client_serverlessapplicationrepository_1 = require("@aws-sdk/client-serverlessapplicationrepository");
const js_yaml_1 = __importDefault(require("js-yaml"));
const uppercase_1 = require("@saws/utils/uppercase");
class FunctionService extends core_1.ServiceDefinition {
    runtime;
    rootDir;
    memory;
    layers;
    serverlessRepoClient = new client_serverlessapplicationrepository_1.ServerlessApplicationRepositoryClient();
    constructor(config) {
        super(config);
        this.runtime = config.runtime;
        this.rootDir = path_1.default.resolve(".", config.rootDir ?? this.name);
        this.memory = config.memory;
        this.layers = config.layers || [];
    }
    async getEnvironmentVariables(_) {
        return {};
    }
    async getLayerTemplate(layerArn, stage) {
        const details = await this.serverlessRepoClient.send(new client_serverlessapplicationrepository_1.GetApplicationCommand({
            ApplicationId: layerArn,
        }));
        const command = new client_serverlessapplicationrepository_1.CreateCloudFormationTemplateCommand({
            ApplicationId: layerArn,
        });
        const response = await this.serverlessRepoClient.send(command);
        const templateRes = await fetch(response.TemplateUrl ?? "");
        const templateYml = await templateRes.text();
        const fullTemplate = js_yaml_1.default.load(templateYml);
        const [name, template] = Object.entries(fullTemplate.Resources)[0];
        return {
            name: `${details.Name?.split("-")
                .map(uppercase_1.uppercase)
                .join("")}${stage}${name}`,
            template,
        };
    }
    getPermissions(stage) {
        return [
            {
                Effect: "Allow",
                Action: ["lambda:InvokeFunction"],
                Resource: {
                    "Fn::Sub": `arn:aws:lambda:\${AWS::Region}:\${AWS::AccountId}:function:${stage}-${this.name}`,
                },
            },
        ];
    }
}
exports.FunctionService = FunctionService;

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContainerFunctionService = void 0;
const cloudformation_1 = require("@saws/aws/cloudformation");
const get_aws_account_id_1 = require("@saws/utils/get-aws-account-id");
const child_process_1 = require("child_process");
const chokidar_1 = require("chokidar");
const get_port_1 = __importDefault(require("get-port"));
const lambda_server_1 = require("@saws/lambda-server");
const FunctionService_1 = require("../FunctionService");
const cloud_formation_template_1 = require("./cloud-formation.template");
const repository_cloud_formation_template_1 = require("./repository-cloud-formation.template");
const docker_1 = require("@saws/utils/docker");
class ContainerFunctionService extends FunctionService_1.FunctionService {
    configPort;
    port;
    process;
    constructor(config) {
        super({
            ...config,
            runtime: "container",
        });
        this.configPort = config.port;
    }
    async build() {
        return new Promise((resolve, reject) => {
            console.log("Building container function", this.name);
            (0, child_process_1.exec)(`docker build -t ${this.name} .`, {
                env: {
                    NODE_ENV: "development",
                    DOCKER_BUILDKIT: "0",
                    COMPOSE_DOCKER_CLI_BUILD: "0",
                },
                cwd: this.rootDir,
            }, (err) => {
                if (err)
                    return reject(err);
                resolve(null);
            });
        });
    }
    async registerFunction() {
        const port = await this.getPort();
        const process = await lambda_server_1.lambdaServer.registerFunction({
            type: 'container',
            name: this.name,
            containerPort: port,
            environment: await this.getDependenciesEnvironmentVariables('local')
        });
        return process;
    }
    async dev() {
        await super.dev();
        await lambda_server_1.lambdaServer.start();
        await (0, docker_1.waitForContainerToBeStopped)(this.name);
        await this.build();
        this.process = await this.registerFunction();
        (0, chokidar_1.watch)(this.rootDir, { ignoreInitial: true }).on("all", async () => {
            console.log("Detected changes in", this.name);
            this.exit();
            await (0, docker_1.waitForContainerToBeStopped)(this.name);
            await this.build();
            this.process = await this.registerFunction();
            console.log(this.name, "ready");
        });
        return;
    }
    async deploy(stage) {
        await super.deploy(stage);
        console.log("Creating ECS repository for", this.name);
        // build repository
        const cloudformationClient = new cloudformation_1.CloudFormation();
        const repositoryTemplate = (0, repository_cloud_formation_template_1.getTemplate)({
            name: this.name,
            stage,
        });
        const repositoryStackName = (0, repository_cloud_formation_template_1.getStackName)(stage, this.name);
        await cloudformationClient.deployStack(repositoryStackName, repositoryTemplate);
        console.log("Deploying function", this.name);
        const accountId = await (0, get_aws_account_id_1.getAwsAccountId)();
        if (accountId == null)
            throw new Error("No account Id found");
        await (0, docker_1.loginToAWSDocker)(accountId);
        await this.build();
        const repositoryName = `${this.name}-${stage}`;
        await (0, docker_1.tagImage)(this.name, accountId, repositoryName, "latest");
        await (0, docker_1.pushImage)(accountId, repositoryName, "latest");
        await cloudformationClient.deployStack((0, cloud_formation_template_1.getStackName)(stage, this.name), (0, cloud_formation_template_1.getTemplate)({
            name: this.name,
            repositoryName: repositoryName,
            tag: "latest",
            stage,
            memory: this.memory,
        }));
        return;
    }
    async getEnvironmentVariables(_) {
        return {};
    }
    getStdOut() {
        return this.process?.stdout;
    }
    async getPort() {
        if (this.port != null)
            return this.port;
        this.port = await (0, get_port_1.default)({ port: this.configPort });
        return this.port;
    }
    exit() {
        this.process?.kill();
        this.process = undefined;
    }
}
exports.ContainerFunctionService = ContainerFunctionService;

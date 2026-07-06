"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContainerService = void 0;
const child_process_1 = require("child_process");
const get_port_1 = __importDefault(require("get-port"));
const chokidar_1 = require("chokidar");
const path_1 = __importDefault(require("path"));
const repository_cloud_formation_template_1 = require("./repository-cloud-formation.template");
const get_aws_account_id_1 = require("@saws/utils/get-aws-account-id");
const cloud_formation_template_1 = require("./cloud-formation.template");
const core_1 = require("@saws/core");
const cloudformation_1 = require("@saws/aws/cloudformation");
const ec2_1 = require("@saws/aws/ec2");
const docker_1 = require("@saws/utils/docker");
class ContainerService extends core_1.ServiceDefinition {
    configPort;
    port;
    rootDir;
    process;
    healthCheckUrl;
    constructor(config) {
        super(config);
        this.rootDir = path_1.default.resolve(".", config.rootDir ?? this.name);
        this.healthCheckUrl = config.healthCheckUrl;
        this.configPort = config.port;
    }
    async build() {
        return new Promise((resolve, reject) => {
            console.log("Building container", this.name);
            (0, child_process_1.exec)(`docker build -t ${this.name} .`, {
                env: {
                    DOCKER_BUILDKIT: "0",
                    COMPOSE_DOCKER_CLI_BUILD: "0",
                    NODE_ENV: "development",
                },
                cwd: this.rootDir,
            }, (err) => {
                if (err)
                    return reject(err);
                resolve(null);
            });
        });
    }
    async dev() {
        await super.dev();
        await (0, docker_1.waitForContainerToBeStopped)(this.name);
        await this.build();
        const port = await this.getPort();
        this.process = (0, child_process_1.spawn)("docker", [
            "run",
            "--rm",
            "--name",
            this.name,
            "-e",
            `PORT=${port}`,
            "-p",
            `${port}:${port}`,
            this.name,
        ]);
        console.log("Starting container", this.name);
        (0, chokidar_1.watch)(this.rootDir, { ignoreInitial: true }).on("all", async () => {
            console.log("Detected changes in", this.name);
            this.exit();
            await (0, docker_1.waitForContainerToBeStopped)(this.name);
            console.log("Rebuilding container...");
            await this.build();
            this.process = (0, child_process_1.spawn)("docker", [
                "run",
                "--rm",
                "--name",
                this.name,
                "-e",
                `PORT=${port}`,
                "-p",
                `${port}:${port}`,
                this.name,
            ]);
            this.process.stdout?.pipe(process.stdout);
            console.log(this.name, "ready");
        });
        await this.setOutputs({
            url: `http://localhost:${port}`,
        }, "local");
    }
    async deploy(stage) {
        await super.deploy(stage);
        const cloudformationClient = new cloudformation_1.CloudFormation();
        const repositoryTemplate = (0, repository_cloud_formation_template_1.getTemplate)({
            name: this.name,
            stage,
        });
        const repositoryStackName = (0, repository_cloud_formation_template_1.getStackName)(stage, this.name);
        await cloudformationClient.deployStack(repositoryStackName, repositoryTemplate);
        const accountId = await (0, get_aws_account_id_1.getAwsAccountId)();
        if (accountId == null)
            throw new Error("No account Id found");
        await (0, docker_1.loginToAWSDocker)(accountId);
        await this.build();
        const repositoryName = `${this.name}-${stage}`;
        await (0, docker_1.tagImage)(this.name, accountId, repositoryName, "latest");
        await (0, docker_1.pushImage)(accountId, repositoryName, "latest");
        const port = await this.getPort();
        let environment = {
            PORT: String(port),
            ...(await this.getDependenciesEnvironmentVariables(stage)),
        };
        const ec2Client = new ec2_1.EC2();
        const defaultVpc = await ec2Client.getDefaultVPC();
        const subnets = await ec2Client.getSubnetsForVPC(defaultVpc.VpcId ?? "");
        const template = (0, cloud_formation_template_1.getTemplate)({
            stage,
            name: this.name,
            repositoryName,
            environment,
            vpcId: defaultVpc.VpcId ?? "",
            subnets: subnets.map((subnet) => subnet.SubnetId ?? ""),
            healthCheckUrl: this.healthCheckUrl,
        });
        const stackName = (0, cloud_formation_template_1.getStackName)(stage, this.name);
        const results = await cloudformationClient.deployStack(stackName, template);
        const outputs = results?.Stacks?.[0].Outputs;
        await this.setOutputs({
            ...Object.fromEntries(outputs?.map(({ OutputKey, OutputValue }) => [
                OutputKey,
                OutputValue,
            ]) ?? []),
        }, stage);
    }
    async getPort() {
        if (this.port != null)
            return this.port;
        this.port = await (0, get_port_1.default)({ port: this.configPort });
        return this.port;
    }
    async getEnvironmentVariables(_) {
        return {
            [this.parameterizedEnvVarName("URL")]: String(this.outputs.url),
        };
    }
    getStdOut() {
        return this.process?.stdout;
    }
    getPermissions() {
        return [];
    }
    exit() {
        (0, child_process_1.exec)(`docker stop ${this.name}`);
        this.process?.kill();
        this.process = undefined;
    }
}
exports.ContainerService = ContainerService;

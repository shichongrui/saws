"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiService = void 0;
const lambda_server_1 = require("@saws/lambda-server");
const cloudformation_1 = require("@saws/aws/cloudformation");
const s3_1 = require("@saws/aws/s3");
const cognito_service_1 = require("@saws/cognito/cognito-service");
const core_1 = require("@saws/core");
const constants_1 = require("@saws/utils/constants");
const build_code_zip_1 = require("@saws/utils/build-code-zip");
const collect_http_body_1 = require("@saws/utils/collect-http-body");
const dependency_management_1 = require("@saws/utils/dependency-management");
const chokidar_1 = require("chokidar");
const esbuild_1 = __importDefault(require("esbuild"));
const fs_extra_1 = __importDefault(require("fs-extra"));
const get_port_1 = __importDefault(require("get-port"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const jwks_rsa_1 = __importDefault(require("jwks-rsa"));
const node_http_1 = __importDefault(require("node:http"));
const node_path_1 = __importDefault(require("node:path"));
const cloud_formation_template_1 = require("./cloud-formation.template");
const graphiql_template_1 = require("./graphiql.template");
const s3_cloud_formation_template_1 = require("./s3-cloud-formation.template");
class ApiService extends core_1.ServiceDefinition {
    rootDir;
    buildContext;
    entryPointPath;
    buildFilePath;
    externalPackages;
    port;
    configPort;
    include;
    constructor(config) {
        super(config);
        this.rootDir = node_path_1.default.resolve(".", config.handler ?? this.name);
        this.entryPointPath = node_path_1.default.resolve(this.rootDir, "index.ts");
        this.buildFilePath = node_path_1.default.resolve(constants_1.BUILD_DIR, this.name, "index.js");
        this.configPort = config.port;
        this.externalPackages = config.externalPackages ?? [];
        this.include = config.include ?? [];
    }
    async build() {
        try {
            if (this.buildContext != null) {
                await this.buildContext.rebuild?.();
                return;
            }
            this.buildContext = await esbuild_1.default.context({
                entryPoints: [this.entryPointPath],
                bundle: true,
                outfile: this.buildFilePath,
                sourcemap: true,
                platform: "node",
                external: ["@aws-sdk", ...this.externalPackages],
                loader: { ".node": "file" },
            });
            await this.buildContext.rebuild();
            for (const includePath of this.include) {
                await fs_extra_1.default.copy(node_path_1.default.resolve(this.rootDir, includePath), node_path_1.default.resolve(constants_1.BUILD_DIR, this.name, includePath));
            }
        }
        catch (err) {
            console.error(err);
        }
    }
    async registerFunction() {
        await lambda_server_1.lambdaServer.registerFunction({
            type: "javascript",
            name: this.name,
            path: this.buildFilePath,
            environment: await this.getDependenciesEnvironmentVariables("local"),
        });
    }
    async dev() {
        await super.dev();
        await this.build();
        await this.registerFunction();
        (0, chokidar_1.watch)(this.rootDir, { ignoreInitial: true }).on("all", async (...args) => {
            console.log(`Detected changes in ${this.name}. Rebuilding...`);
            await this.build();
            await this.registerFunction();
        });
        await this.startDevServer();
        await lambda_server_1.lambdaServer.start();
    }
    async startDevServer() {
        const authDependency = this.dependencies.find((serviceDefinition) => serviceDefinition instanceof cognito_service_1.CognitoService);
        const { userPoolId, accessToken } = authDependency?.getOutputs() ?? {};
        const client = (0, jwks_rsa_1.default)({
            jwksUri: `http://localhost:9229/${userPoolId}/.well-known/jwks.json`,
        });
        const getJwksKey = (header, callback) => {
            client.getSigningKey(header.kid, (_, key) => {
                callback(null, key?.getPublicKey());
            });
        };
        return new Promise(async (resolve) => {
            const port = await this.getPort();
            const server = node_http_1.default.createServer(async (req, res) => {
                if (req.method === "GET" && req.url === "/graphiql") {
                    const html = (0, graphiql_template_1.graphiqlTemplate)({
                        graphqlServerUrl: `http://localhost:${this.port}`,
                        accessToken: String(accessToken),
                    });
                    res.writeHead(200, { "Content-Type": "text/html" });
                    res.end(html);
                    return;
                }
                try {
                    const authToken = req.headers.authorization?.replace("Bearer ", "") ?? "";
                    if (authDependency != null) {
                        if (authToken.length === 0) {
                            res.writeHead(401);
                            res.end("Unauthorized");
                            return;
                        }
                        await new Promise((resolve, reject) => {
                            jsonwebtoken_1.default.verify(authToken, getJwksKey, {}, (err, decoded) => {
                                if (err)
                                    return reject(err);
                                resolve(decoded);
                            });
                        });
                    }
                    const body = await (0, collect_http_body_1.collectHttpBody)(req);
                    const context = {
                        callbackWaitsForEmptyEventLoop: true,
                        functionName: "saws-api",
                        functionVersion: "1",
                        invokedFunctionArn: "aws:local:function",
                        memoryLimitInMB: "128",
                        awsRequestId: "1234",
                        logGroupName: "asdf",
                        logStreamName: "asdf",
                        getRemainingTimeInMillis: () => 1234,
                        done: () => { },
                        fail: () => { },
                        succeed: () => { },
                    };
                    const resultString = await lambda_server_1.lambdaServer.invokeFunction(this.name, {
                        httpMethod: req.method,
                        path: req.url,
                        headers: {
                            ...req.headers,
                            Authorization: authToken,
                        },
                        requestContext: {},
                        // for remix apps we need the base64 encoded string
                        body: Buffer.from(body || "", "base64").toString(),
                    }, context);
                    const results = JSON.parse(resultString);
                    res.writeHead(results.statusCode, {
                        ...results.headers,
                        ...results.multiValueHeaders,
                    });
                    res.end(results.body);
                }
                catch (err) {
                    console.log(err);
                    res.writeHead(500);
                    res.end();
                }
            });
            server.listen(port, "0.0.0.0", async () => {
                await this.setOutputs({
                    apiEndpoint: `http://localhost:${port}`,
                }, "local");
                console.log(`${this.name} Endpoint:`, `http://localhost:${port}`);
                resolve(null);
            });
        });
    }
    async getPort() {
        if (this.port != null)
            return this.port;
        this.port = await (0, get_port_1.default)({ port: this.configPort });
        return this.port;
    }
    async deploy(stage) {
        await super.deploy(stage);
        console.log(`Creating bucket to store ${this.name} code in`);
        // create s3 bucket
        const cloudformationClient = new cloudformation_1.CloudFormation();
        const s3Client = new s3_1.S3();
        const bucketName = `${stage}-${this.name}`;
        const s3Template = (0, s3_cloud_formation_template_1.getTemplate)({ bucketName });
        const s3StackName = (0, s3_cloud_formation_template_1.getStackName)(stage, this.name);
        await cloudformationClient.deployStack(s3StackName, s3Template);
        console.log("Building", this.name);
        await this.build();
        this.buildContext?.dispose();
        // for external node modules, we need to re-install them so that we get
        // them and all their dependencies
        if (this.externalPackages.length > 0) {
            await (0, dependency_management_1.npmInstallDependency)(this.externalPackages.join(" "), {
                cwd: node_path_1.default.parse(this.buildFilePath).dir,
            });
        }
        // upload build to S3
        console.log("Uploading", this.name);
        const zipPath = await (0, build_code_zip_1.buildCodeZip)(this.buildFilePath, {
            name: this.name,
            include: this.include,
            hasExternalModules: this.externalPackages.length > 0,
            includePrisma: this.dependencies.some((dep) => dep.constructor.name === "PostgresService"),
        });
        const key = node_path_1.default.parse(zipPath).base;
        const fileExists = await s3Client.doesFileExist(bucketName, key);
        if (!fileExists) {
            await s3Client.uploadFileFromPath(bucketName, key, zipPath);
        }
        console.log("Deploying", this.name);
        const authModule = this.dependencies.find((service) => service instanceof cognito_service_1.CognitoService);
        const { userPoolId, userPoolClientId } = authModule?.getOutputs() ?? {};
        const environment = await this.getDependenciesEnvironmentVariables(stage);
        const permissions = this.dependencies
            .map((dependency) => dependency.getPermissions(process.env.STAGE))
            .flat();
        const template = (0, cloud_formation_template_1.getTemplate)({
            name: this.name,
            stage,
            moduleName: node_path_1.default.parse(this.buildFilePath).name,
            codeBucketName: bucketName,
            codeS3Key: key,
            userPoolId: userPoolId != null ? String(userPoolId) : undefined,
            userPoolClientId: userPoolClientId != null ? String(userPoolClientId) : undefined,
            permissions,
            environment,
        });
        const stackName = (0, cloud_formation_template_1.getStackName)(stage, this.name);
        const results = await cloudformationClient.deployStack(stackName, template);
        const outputs = results?.Stacks?.[0].Outputs;
        this.setOutputs({
            ...Object.fromEntries(outputs?.map(({ OutputKey, OutputValue }) => [
                OutputKey,
                OutputValue,
            ]) ?? []),
        }, stage);
        return;
    }
    async getEnvironmentVariables(_) {
        return {
            [this.parameterizedEnvVarName("API_URL")]: String(this.outputs.apiEndpoint),
        };
    }
}
exports.ApiService = ApiService;

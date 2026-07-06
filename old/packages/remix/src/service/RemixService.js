"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RemixService = void 0;
const build_code_zip_1 = require("@saws/utils/build-code-zip");
const constants_1 = require("@saws/utils/constants");
const copy_directory_1 = require("@saws/utils/copy-directory");
const recursively_read_dir_1 = require("@saws/utils/recursively-read-dir");
const transform_incoming_message_to_lambda_event_1 = require("@saws/utils/transform-incoming-message-to-lambda-event");
const chokidar_1 = require("chokidar");
const esbuild_1 = __importDefault(require("esbuild"));
const fs_1 = __importDefault(require("fs"));
const get_port_1 = __importDefault(require("get-port"));
const http_1 = __importDefault(require("http"));
const mime_types_1 = __importDefault(require("mime-types"));
const path_1 = __importDefault(require("path"));
const ws_1 = __importDefault(require("ws"));
const cloud_formation_template_1 = require("./cloud-formation.template");
const code_s3_cloud_formation_template_1 = require("./code-s3-cloud-formation.template");
const compiler = __importStar(require("@remix-run/dev/dist/compiler/compiler"));
const fileWatchCache_1 = require("@remix-run/dev/dist/compiler/fileWatchCache");
const config_1 = require("@remix-run/dev/dist/config");
const logger_1 = require("@remix-run/dev/dist/tux/logger");
const lambda_server_1 = require("@saws/lambda-server");
const cloudformation_1 = require("@saws/aws/cloudformation");
const cloudfront_1 = require("@saws/aws/cloudfront");
const s3_1 = require("@saws/aws/s3");
const core_1 = require("@saws/core");
const fs_extra_1 = __importDefault(require("fs-extra"));
const dependency_management_1 = require("@saws/utils/dependency-management");
const create_file_if_not_exists_1 = require("@saws/utils/create-file-if-not-exists");
const root_template_1 = require("./templates/root.template");
const index_route_template_1 = require("./templates/index-route.template");
const index_template_1 = require("./templates/index.template");
const remix_config_template_1 = require("./templates/remix-config.template");
class RemixService extends core_1.ServiceDefinition {
    rootDir;
    buildFilePath;
    handlerRef;
    configPort;
    port;
    configLiveReloadPort;
    liveReloadPort;
    buildContext;
    entryPointPath;
    remixCompiler;
    include;
    constructor(config) {
        super(config);
        this.rootDir = path_1.default.resolve(".", config.rootDir ?? this.name);
        this.buildFilePath = path_1.default.resolve(constants_1.BUILD_DIR, this.name, "index.js");
        this.entryPointPath = path_1.default.resolve(this.rootDir, "index.ts");
        this.configPort = config.port;
        this.configLiveReloadPort = config.liveReloadPort ?? 8002;
        this.include = config.include ?? [];
    }
    async init() {
        try {
            const requiredDependencies = [
                "@remix-run/node",
                "@remix-run/react",
                "isbot",
                "react",
                "react-dom",
            ];
            await (0, dependency_management_1.installMissingDependencies)(requiredDependencies);
            const requiredDevDependencies = ["@remix-run/dev", "@types/react", "@types/react-dom"];
            await (0, dependency_management_1.installMissingDependencies)(requiredDevDependencies, { development: true });
            fs_1.default.mkdirSync(path_1.default.resolve(this.rootDir, "public"), { recursive: true });
            fs_1.default.mkdirSync(path_1.default.resolve(this.rootDir, "build"), { recursive: true });
            fs_1.default.mkdirSync(path_1.default.resolve(this.rootDir, "app", "routes"), {
                recursive: true,
            });
            (0, create_file_if_not_exists_1.createFileIfNotExists)(path_1.default.resolve(this.rootDir, "app", "root.tsx"), (0, root_template_1.rootTemplate)({ name: this.name }));
            (0, create_file_if_not_exists_1.createFileIfNotExists)(path_1.default.resolve(this.rootDir, "app", "routes", "_index.tsx"), (0, index_route_template_1.indexRouteTemplate)());
            (0, create_file_if_not_exists_1.createFileIfNotExists)(path_1.default.resolve(this.rootDir, "index.ts"), (0, index_template_1.indexTemplate)());
            (0, create_file_if_not_exists_1.createFileIfNotExists)(path_1.default.resolve(".", "remix.config.js"), (0, remix_config_template_1.remixConfig)({ name: this.name }));
        }
        catch (err) {
            console.log(err);
        }
    }
    // the default remix build command has a few implications
    // 1. it does a process.exit(1) on any build failures
    // 2. it doesn't dispose of the compiler and thus it hangs
    // So we are building it ourselves based on how it works but without that stuff
    async buildRemix(mode) {
        if (this.remixCompiler != null) {
            await this.remixCompiler?.cancel();
            await this.remixCompiler?.dispose();
            this.remixCompiler = null;
        }
        let config = await (0, config_1.readConfig)(path_1.default.resolve("."));
        const port = await this.getPort();
        let options = {
            mode,
            sourcemap: mode === "development",
            REMIX_DEV_ORIGIN: mode === "development"
                ? new URL(`http://localhost:${port}`)
                : undefined,
            external: mode === "production" ? ["@aws-sdk"] : [],
        };
        let fileWatchCache = (0, fileWatchCache_1.createFileWatchCache)();
        fs_extra_1.default.emptyDirSync(config.assetsBuildDirectory);
        this.remixCompiler = await compiler.create({
            config,
            options,
            fileWatchCache,
            logger: logger_1.logger,
        });
        await this.remixCompiler.compile();
    }
    async build(mode = "development") {
        try {
            await this.buildRemix(mode);
            await (0, copy_directory_1.copyDirectory)(path_1.default.join(this.rootDir, "public"), path_1.default.resolve(constants_1.BUILD_DIR, this.name, "public"));
            if (this.buildContext != null) {
                await this.buildContext.rebuild?.();
                return;
            }
            this.buildContext = await esbuild_1.default.context({
                minify: mode === "production",
                treeShaking: true,
                entryPoints: [this.entryPointPath],
                bundle: true,
                outfile: this.buildFilePath,
                sourcemap: true,
                platform: "node",
                external: mode === "production" ? ["@aws-sdk"] : [],
                loader: { ".node": "file" },
            });
            await this.buildContext.rebuild();
            for (const includePath of this.include) {
                await fs_extra_1.default.copy(path_1.default.resolve(this.rootDir, includePath), path_1.default.resolve(constants_1.BUILD_DIR, this.name, includePath));
            }
        }
        catch (err) {
            console.error("Remix build error", err);
            this.buildContext?.dispose();
            this.buildContext = undefined;
            this.remixCompiler?.dispose();
            this.remixCompiler = null;
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
        console.log("Building remix app", this.name);
        let wss = new ws_1.default.Server({ port: await this.getLiveReloadPort() });
        function broadcast(event) {
            setTimeout(() => {
                wss.clients.forEach((client) => {
                    if (client.readyState === ws_1.default.OPEN) {
                        client.send(JSON.stringify(event));
                    }
                });
            }, 500);
        }
        await this.build();
        await this.registerFunction();
        broadcast({ type: "RELOAD" });
        (0, chokidar_1.watch)(this.rootDir, {
            ignoreInitial: true,
            ignored: [path_1.default.join(this.rootDir, "build")],
        }).on("all", async (...args) => {
            console.log(`Detected changes in ${this.name}. Rebuilding...`);
            await this.build();
            await this.registerFunction();
            broadcast({ type: "RELOAD" });
        });
        await this.startDevServer();
        await lambda_server_1.lambdaServer.start();
    }
    captureHandlerRef() {
        const modulePath = path_1.default.resolve(constants_1.BUILD_DIR, this.name);
        for (const key of Object.keys(require.cache)) {
            if (key.startsWith(modulePath)) {
                delete require.cache[key];
            }
        }
        this.handlerRef = require(this.buildFilePath).handler;
    }
    async startDevServer() {
        console.log("Starting remix server", this.name);
        return new Promise(async (resolve) => {
            const port = await this.getPort();
            const server = http_1.default.createServer(async (req, res) => {
                if (req.method === "GET" && req.url?.startsWith("/public")) {
                    try {
                        const file = fs_1.default.readFileSync(path_1.default.join(constants_1.BUILD_DIR, this.name, req.url));
                        const contentType = mime_types_1.default.lookup(req.url) || "application/octet-stream";
                        res.writeHead(200, { "Content-Type": contentType });
                        if (contentType.startsWith("text") ||
                            contentType === "application/javascript" ||
                            contentType === "application/json") {
                            res.end(file, "utf-8");
                        }
                        else {
                            res.end(file);
                        }
                        return;
                    }
                    catch (err) {
                        res.writeHead(404, { "Content-Type": "text/plain" });
                        res.end("404 Not Found");
                        return;
                    }
                }
                try {
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
                    const resultString = await lambda_server_1.lambdaServer.invokeFunction(this.name, await (0, transform_incoming_message_to_lambda_event_1.transformRequestToLambdaEvent)(req), context);
                    const results = JSON.parse(resultString);
                    const headers = {
                        ...results.headers,
                        ...results.multiValueHeaders,
                    };
                    if (results.cookies?.length > 0) {
                        headers["set-cookie"] = results.cookies.join("; ");
                    }
                    res.writeHead(results.statusCode, headers);
                    res.end(results.isBase64Encoded
                        ? Buffer.from(results.body, "base64")
                        : results.body);
                }
                catch (err) {
                    console.log(err);
                    res.writeHead(500);
                    res.end();
                }
            });
            server.listen(port, "0.0.0.0", () => {
                this.setOutputs({
                    remixEndpoint: `http://localhost:${port}`,
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
    async getLiveReloadPort() {
        if (this.liveReloadPort != null)
            return this.liveReloadPort;
        this.liveReloadPort = await (0, get_port_1.default)({ port: this.configLiveReloadPort });
        return this.liveReloadPort;
    }
    async deploy(stage) {
        await super.deploy(stage);
        console.log(`Creating bucket to store ${this.name} code in`);
        // create s3 bucket
        const cloudformationClient = new cloudformation_1.CloudFormation();
        const s3Client = new s3_1.S3();
        const bucketName = `${stage}-${this.name}-code`;
        const s3Template = (0, code_s3_cloud_formation_template_1.getTemplate)({ bucketName, name: this.name });
        const s3StackName = (0, code_s3_cloud_formation_template_1.getStackName)(stage, this.name);
        await cloudformationClient.deployStack(s3StackName, s3Template);
        console.log("Deploying function", this.name);
        await this.build("production");
        await this.remixCompiler?.dispose();
        this.buildContext?.dispose();
        // upload build to S3
        console.log("Uploading", this.name);
        const zipPath = await (0, build_code_zip_1.buildCodeZip)(this.buildFilePath, {
            name: this.name,
            include: this.include,
            hasExternalModules: false,
            includePrisma: this.dependencies.some(dep => dep.constructor.name === 'PostgresService')
        });
        const key = path_1.default.parse(zipPath).base;
        const fileExists = await s3Client.doesFileExist(bucketName, key);
        if (!fileExists) {
            await s3Client.uploadFileFromPath(bucketName, key, zipPath);
        }
        console.log("Deploying", this.name);
        let environment = await this.getDependenciesEnvironmentVariables(stage);
        const permissions = this.dependencies
            .map((dependency) => dependency.getPermissions(stage))
            .flat();
        const template = (0, cloud_formation_template_1.getTemplate)({
            name: this.name,
            stage,
            moduleName: path_1.default.parse(this.buildFilePath).name,
            codeBucketName: bucketName,
            codeS3Key: key,
            permissions: [...permissions, ...this.getPermissions(stage)],
            environment,
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
        const publicBuildDir = path_1.default.resolve(constants_1.BUILD_DIR, this.name, "public");
        const publicFiles = await (0, recursively_read_dir_1.recursivelyReadDir)(publicBuildDir);
        for (const file of publicFiles) {
            await s3Client.uploadFileFromPath(`${this.name}-resources-${stage}`, file.replace(path_1.default.resolve(constants_1.BUILD_DIR, this.name) + "/", ""), file);
        }
        const cloudfrontClient = new cloudfront_1.Cloudfront();
        await cloudfrontClient.createInvalidation(String(this.outputs.distributionId), "/*");
        return;
    }
    async getEnvironmentVariables(_) {
        return {};
    }
    getStdOut() {
        return null;
    }
    getPermissions(_stage) {
        return [];
    }
}
exports.RemixService = RemixService;

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TypescriptFunctionService = void 0;
const path_1 = __importDefault(require("path"));
const cloud_formation_template_1 = require("./cloud-formation.template");
const s3_cloud_formation_template_1 = require("./s3-cloud-formation.template");
const chokidar_1 = require("chokidar");
const esbuild_1 = __importDefault(require("esbuild"));
const build_code_zip_1 = require("@saws/utils/build-code-zip");
const constants_1 = require("@saws/utils/constants");
const dependency_management_1 = require("@saws/utils/dependency-management");
const FunctionService_1 = require("../FunctionService");
const lambda_server_1 = require("@saws/lambda-server");
const cloudformation_1 = require("@saws/aws/cloudformation");
const s3_1 = require("@saws/aws/s3");
const fs_extra_1 = __importDefault(require("fs-extra"));
const node_fs_1 = __importDefault(require("node:fs"));
const create_file_if_not_exists_1 = require("@saws/utils/create-file-if-not-exists");
const entrypoint_template_1 = require("./entrypoint.template");
class TypescriptFunctionService extends FunctionService_1.FunctionService {
    triggers;
    // buildResults?: esbuild.BuildResult;
    buildContext;
    handlerRef;
    entryPointPath;
    buildFilePath;
    externalPackages;
    include;
    constructor(config) {
        super({
            ...config,
            runtime: "typescript",
        });
        this.triggers = config.triggers;
        this.entryPointPath = path_1.default.resolve(this.rootDir, "index.ts");
        this.buildFilePath = path_1.default.resolve(constants_1.BUILD_DIR, this.name, "index.js");
        this.externalPackages = config.externalPackages ?? [];
        this.include = config.include ?? [];
    }
    async init() {
        await (0, dependency_management_1.installMissingDependencies)(["aws-lambda"]);
        await (0, dependency_management_1.installMissingDependencies)(["@types/aws-lambda"], {
            development: true,
        });
        node_fs_1.default.mkdirSync(path_1.default.resolve(this.name), { recursive: true });
        await (0, create_file_if_not_exists_1.createFileIfNotExists)(path_1.default.resolve(this.name, "index.ts"), (0, entrypoint_template_1.entrypointTemplate)());
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
                await fs_extra_1.default.copy(path_1.default.resolve(this.rootDir, includePath), path_1.default.resolve(constants_1.BUILD_DIR, this.name, includePath));
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
            environment: {
                NODE_ENV: "development",
                ...(await this.getDependenciesEnvironmentVariables("local")),
            },
        });
    }
    async dev() {
        await super.dev();
        console.log("Building function", this.name);
        await this.build();
        await this.registerFunction();
        (0, chokidar_1.watch)(this.rootDir, { ignoreInitial: true }).on("all", async (...args) => {
            console.log(`Detected changes in ${this.name}. Rebuilding...`);
            await this.build();
            await this.registerFunction();
        });
        await lambda_server_1.lambdaServer.start();
    }
    async deploy(stage) {
        await super.deploy(stage);
        const layerTemplates = await Promise.all(this.layers.map((layerArn) => this.getLayerTemplate(layerArn, stage)));
        console.log(`Creating bucket to store ${this.name} code in`);
        // create s3 bucket
        const cloudformationClient = new cloudformation_1.CloudFormation();
        const s3Client = new s3_1.S3();
        const bucketName = `${stage}-${this.name}-code`.toLowerCase();
        const s3Template = (0, s3_cloud_formation_template_1.getTemplate)({ bucketName });
        const s3StackName = (0, s3_cloud_formation_template_1.getStackName)(stage, this.name);
        await cloudformationClient.deployStack(s3StackName, s3Template);
        console.log("Deploying function", this.name);
        await this.build();
        this.buildContext?.dispose();
        // for external node modules, we need to re-install them so that we get
        // them and all their dependencies
        if (this.externalPackages.length > 0) {
            await (0, dependency_management_1.npmInstallDependency)(this.externalPackages.join(" "), {
                cwd: path_1.default.parse(this.buildFilePath).dir,
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
            triggers: this.triggers,
            layers: layerTemplates,
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
        return;
    }
    async getEnvironmentVariables(_) {
        return {};
    }
    getStdOut() {
        return null;
    }
    exit() {
        this.buildContext?.dispose();
        this.buildContext = undefined;
    }
}
exports.TypescriptFunctionService = TypescriptFunctionService;

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebsiteService = void 0;
const cloudformation_1 = require("@saws/aws/cloudformation");
const cloudfront_1 = require("@saws/aws/cloudfront");
const s3_1 = require("@saws/aws/s3");
const core_1 = require("@saws/core");
const constants_1 = require("@saws/utils/constants");
const recursively_read_dir_1 = require("@saws/utils/recursively-read-dir");
const get_port_1 = __importDefault(require("get-port"));
const path_1 = __importDefault(require("path"));
const vite_1 = __importDefault(require("vite"));
const cloudfront_template_1 = require("./cloudfront.template");
const s3_cloud_formation_template_1 = require("./s3-cloud-formation.template");
const node_fs_1 = __importDefault(require("node:fs"));
const index_html_template_1 = require("./templates/index-html.template");
const create_file_if_not_exists_1 = require("@saws/utils/create-file-if-not-exists");
const main_css_template_1 = require("./templates/main-css.template");
const main_ts_template_1 = require("./templates/main-ts.template");
class WebsiteService extends core_1.ServiceDefinition {
    configPort;
    port;
    rootDir;
    domain;
    env;
    certificateArn;
    constructor(config) {
        super(config);
        this.rootDir = path_1.default.resolve(".", config.rootDir ?? this.name);
        this.domain = config.domain ?? `${this.name}.saws`;
        this.env = config.env ?? {};
        this.configPort = config.port;
        this.certificateArn = config.certificateArn;
    }
    async init() {
        node_fs_1.default.mkdirSync(path_1.default.resolve(this.name), { recursive: true });
        (0, create_file_if_not_exists_1.createFileIfNotExists)(path_1.default.resolve(this.name, "index.html"), (0, index_html_template_1.indexHtmlTemplate)({ name: this.name }));
        (0, create_file_if_not_exists_1.createFileIfNotExists)(path_1.default.resolve(this.name, 'main.css'), (0, main_css_template_1.mainCSSTemplate)());
        (0, create_file_if_not_exists_1.createFileIfNotExists)(path_1.default.resolve(this.name, 'main.ts'), (0, main_ts_template_1.mainTSTemplate)());
        await this.writeEnvVarFile("dev", "development");
    }
    async writeEnvVarFile(stage, nodeEnv) {
        const environmentVariables = {
            ...this.env,
            ...(await this.getDependenciesEnvironmentVariables(stage)),
        };
        const envFileContents = Object.entries(environmentVariables)
            .map(([key, value]) => `VITE_${key}=${value}\n`)
            .join("") + `NODE_ENV=${nodeEnv}\n`;
        node_fs_1.default.writeFileSync(path_1.default.resolve(this.rootDir, `.env.${stage}`), envFileContents, "utf-8");
    }
    async dev() {
        await super.dev();
        this.port = await (0, get_port_1.default)({ port: this.configPort });
        const server = await vite_1.default.createServer({
            root: this.rootDir,
            clearScreen: false,
            mode: "dev",
            envDir: this.rootDir,
            server: {
                port: this.port,
            },
        });
        await server.listen();
        await this.setOutputs({
            websiteUrl: server.resolvedUrls?.local[0],
        }, "local");
        console.log(`${this.name} website is at ${server.resolvedUrls?.local[0]}`);
    }
    async deploy(stage) {
        await super.deploy(stage);
        await this.writeEnvVarFile(stage, "production");
        const cloudformationClient = new cloudformation_1.CloudFormation();
        const s3Client = new s3_1.S3();
        const s3StackName = (0, s3_cloud_formation_template_1.getStackName)(stage, this.name);
        const s3Template = (0, s3_cloud_formation_template_1.getTemplate)({
            name: this.name,
            stage,
            domain: this.domain,
        });
        const results = await cloudformationClient.deployStack(s3StackName, s3Template);
        const outputs = results?.Stacks?.[0].Outputs;
        await this.setOutputs({
            ...Object.fromEntries(outputs?.map(({ OutputKey, OutputValue }) => [
                OutputKey,
                OutputValue,
            ]) ?? []),
        }, stage);
        const allFiles = await (0, recursively_read_dir_1.recursivelyReadDir)(this.rootDir);
        const allHtmlFiles = allFiles.filter((f) => f.endsWith(".html"));
        const buildDir = path_1.default.resolve(constants_1.BUILD_DIR, this.name);
        await vite_1.default.build({
            root: this.rootDir,
            mode: stage,
            envDir: this.rootDir,
            build: {
                outDir: buildDir,
                emptyOutDir: true,
                rollupOptions: {
                    input: allHtmlFiles.reduce((acc, f) => {
                        const relativePath = f.replace(this.rootDir + "/", "");
                        const parsedPath = path_1.default.parse(relativePath);
                        const key = [parsedPath.dir, parsedPath.name]
                            .filter(Boolean)
                            .join("-");
                        acc[key] = f;
                        return acc;
                    }, {}),
                },
            },
        });
        console.log("Uploading", this.name);
        const files = await (0, recursively_read_dir_1.recursivelyReadDir)(buildDir);
        await Promise.all(files.map((file) => s3Client.uploadFileFromPath(this.domain, file.replace(buildDir + "/", ""), file)));
        if (this.domain != null && this.certificateArn != null) {
            const template = (0, cloudfront_template_1.getTemplate)({
                domain: this.domain,
                certificateArn: this.certificateArn,
                s3WebsiteUrl: String(this.outputs.websiteS3Url),
            });
            const stackName = (0, cloudfront_template_1.getStackName)(stage, this.name);
            const results = await cloudformationClient.deployStack(stackName, template);
            const cloudfrontOutputs = results?.Stacks?.[0].Outputs;
            await this.setOutputs({
                ...Object.fromEntries(cloudfrontOutputs?.map(({ OutputKey, OutputValue }) => [
                    OutputKey,
                    OutputValue,
                ]) ?? []),
            }, stage);
            const cloudfrontClient = new cloudfront_1.Cloudfront();
            await cloudfrontClient.createInvalidation(String(this.outputs.distributionId), "/*");
        }
    }
    async getEnvironmentVariables(_) {
        return {};
    }
    getStdOut() {
        return null;
    }
    getPermissions(_) {
        return [];
    }
    exit() { }
}
exports.WebsiteService = WebsiteService;

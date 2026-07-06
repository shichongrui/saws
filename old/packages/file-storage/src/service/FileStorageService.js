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
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileStorageService = void 0;
const path = __importStar(require("node:path"));
const core_1 = require("@saws/core");
const constants_1 = require("@saws/utils/constants");
const docker_1 = require("@saws/utils/docker");
const s3_1 = require("@saws/aws/s3");
const cloudformation_1 = require("@saws/aws/cloudformation");
const cloud_formation_template_1 = require("./cloud-formation.template");
class FileStorageService extends core_1.ServiceDefinition {
    static process;
    localS3Client = new s3_1.S3({
        endpoint: "http://127.0.0.1:9001",
        credentials: {
            accessKeyId: "minioadmin",
            secretAccessKey: "minioadmin",
        },
    });
    getBucketName(stage) {
        return `${stage}-${this.name}`;
    }
    async dev() {
        await super.dev();
        await this.startS3Docker();
        await this.createBucket();
    }
    async createBucket() {
        const buckets = await this.localS3Client.listBuckets();
        if (buckets.Buckets?.find((bucket) => bucket.Name === this.getBucketName("local")) == null) {
            await this.localS3Client.createBucket(this.getBucketName("local"));
        }
    }
    async startS3Docker() {
        console.log("Starting file storage");
        if (FileStorageService.process != null)
            return;
        const childProcess = await (0, docker_1.startContainer)({
            name: this.name,
            image: "minio/minio",
            command: ["server", "/data", "--console-address", ":9002"],
            additionalArguments: [
                "-p",
                "9001:9000",
                "-p",
                "9002:9002",
                "-v",
                `${path.resolve(constants_1.SAWS_DIR, "s3")}/:/data`,
            ],
            check: async () => {
                try {
                    await this.localS3Client.listBuckets();
                    return true;
                }
                catch (err) {
                    // console.log(err);
                    return false;
                }
            },
        });
        await this.setOutputs({
            s3Endpoint: "http://127.0.0.1:9001",
            s3AccessKey: "minioadmin",
            s3SecretKey: "minioadmin",
        }, "local");
        FileStorageService.process = childProcess;
    }
    async deploy(stage) {
        await super.deploy(stage);
        const cloudformationClient = new cloudformation_1.CloudFormation();
        const template = (0, cloud_formation_template_1.getTemplate)({
            bucketName: this.getBucketName(stage),
            name: this.name,
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
        const env = {};
        if (this.outputs.s3Endpoint != null) {
            env.S3_ENDPOINT = String(this.outputs.s3Endpoint);
        }
        if (this.outputs.s3AccessKey != null) {
            env.S3_ACCESS_KEY = String(this.outputs.s3AccessKey);
        }
        if (this.outputs.s3SecretKey != null) {
            env.S3_SECRET_KEY = String(this.outputs.s3SecretKey);
        }
        return env;
    }
    getStdOut() {
        return FileStorageService.process?.stdout;
    }
    getPermissions(stage) {
        return [
            {
                Effect: "Allow",
                Action: ["s3:*"],
                Resource: [
                    `arn:aws:s3:::${this.getBucketName(stage)}`,
                    `arn:aws:s3:::${this.getBucketName(stage)}/*`,
                ],
            },
        ];
    }
    exit() {
        FileStorageService.process?.kill();
        FileStorageService.process = undefined;
    }
}
exports.FileStorageService = FileStorageService;

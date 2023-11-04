import {
  FileStorageConfig,
  ModuleType,
  RemixConfig,
  SAWS_DIR,
  ServiceType,
  getProjectName,
  retryUntil,
} from "@shichongrui/saws-core";
import { AWSPermission, ModuleDefinition, Outputs } from "../ModuleDefinition";
import { Readable } from "stream";
import { waitForContainerToBeStopped } from "../../shell-commands/docker";
import { ChildProcess, spawn } from "child_process";
import path from "path";
import { S3 } from "@shichongrui/saws-aws";

export class FileStorage implements ModuleDefinition, FileStorageConfig {
  type: ServiceType.FILE_STORAGE = ServiceType.FILE_STORAGE;
  name: string;
  displayName: string;
  config: FileStorageConfig;
  dependencies: ModuleDefinition[];
  outputs: Outputs = {};
  process?: ChildProcess;

  constructor(
    name: string,
    config: FileStorageConfig,
    dependencies: ModuleDefinition[]
  ) {
    this.name = name;
    this.displayName = config.displayName || name;
    this.config = config;
    this.dependencies = dependencies;
  }
  
  getBucketName(stage: string) {
    return `${stage}-${this.name}-file-storage`
  }

  async dev() {
    await this.startS3Docker();
  }

  async startS3Docker() {
    console.log("Starting file storage");
    await waitForContainerToBeStopped(`${this.name}-s3`);

    this.setOutputs({
      s3Endpoint: 'http://127.0.0.1:9000',
      s3AccessKey: 'minioadmin',
      s3SecretKey: 'minioadmin'
    })

    process.env = {
      ...process.env,
      ...(await this.getEnvironmentVariables())
    }

    const childProcess = spawn("docker", [
      "run",
      "--rm",
      "--name",
      `${this.name}-s3`,
      "-p",
      "9000:9000",
      "-p",
      "9001:9001",
      "-v",
      `${path.resolve(SAWS_DIR, "s3")}/:/data`,
      "minio/minio",
      "server",
      "/data",
      "--console-address",
      ":9001",
    ])

    const client = new S3();
    await retryUntil(async () => {
      try {
        await client.listBuckets();
        return true;
      } catch (_) {
        return false;
      }
    }, 1000);

    const buckets = await client.listBuckets()
    if (buckets.Buckets?.find(bucket => bucket.Name === this.getBucketName('local')) == null) {
      await client.createBucket(this.getBucketName('local'))
    }

    this.process = childProcess;
  }

  async deploy(stage: string) {}

  setOutputs(outputs: Outputs) {
    this.outputs = {
      ...this.outputs,
      ...outputs,
    };
  }

  getOutputs() {
    return this.outputs;
  }

  async getEnvironmentVariables() {
    return {
      S3_ENDPOINT: String(this.outputs.s3Endpoint),
      S3_ACCESS_KEY: String(this.outputs.s3AccessKey),
      S3_SECRET_KEY: String(this.outputs.s3SecretKey),
    };
  }

  getStdOut() {
    return this.process?.stdout;
  }

  getPermissions(dependantType: ModuleType, stage: string) {
    return [];
  }

  exit() {}
}

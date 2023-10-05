import {
  FileStorageConfig,
  ModuleType,
  RemixConfig,
  SAWS_DIR,
  ServiceType,
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

  async dev() {

  }

  async startS3Docker() {
    await waitForContainerToBeStopped(`${this.name}-s3`);

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
      "\":9001\""
    ]);

    await retryUntil(async () => {
      const client = new S3()
      try {
        await client.listBuckets()
        return true
      } catch (_) {
        return false
      }
    }, 1000);

    this.setOutputs({
      s3Endpoint: 'localhost:9001'
    });

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
    return {};
  }

  getStdOut() {
    return null;
  }

  getPermissions(dependantType: ModuleType, stage: string) {
    return [];
  }

  exit() {}
}

import { ChildProcess } from "child_process";
import * as path from "node:path";
import { ServiceDefinition } from "@saws/core";
import { SAWS_DIR } from "@saws/utils/constants";
import { startContainer } from "@saws/utils/docker";
import { S3 } from "@saws/aws/s3";
import { CloudFormation } from "@saws/aws/cloudformation";
import { getStackName, getTemplate } from "./cloud-formation.template";

export class FileStorageService extends ServiceDefinition {
  static process?: ChildProcess;

  localS3Client: S3 = new S3({
    endpoint: "http://127.0.0.1:9001",
    credentials: {
      accessKeyId: "minioadmin",
      secretAccessKey: "minioadmin",
    },
  });

  getBucketName(stage: string) {
    return `${stage}-${this.name}`;
  }

  async dev() {
    await super.dev();

    await this.startS3Docker();

    await this.createBucket();
  }

  async createBucket() {
    const buckets = await this.localS3Client.listBuckets();
    if (
      buckets.Buckets?.find(
        (bucket) => bucket.Name === this.getBucketName("local")
      ) == null
    ) {
      await this.localS3Client.createBucket(this.getBucketName("local"));
    }
  }

  async startS3Docker() {
    console.log("Starting file storage");

    if (FileStorageService.process != null) return;

    const childProcess = await startContainer({
      name: this.name,
      image: "minio/minio",
      command: ["server", "/data", "--console-address", ":9002"],
      additionalArguments: [
        "-p",
        "9001:9000",
        "-p",
        "9002:9002",
        "-v",
        `${path.resolve(SAWS_DIR, "s3")}/:/data`,
      ],
      check: async () => {
        try {
          await this.localS3Client.listBuckets();
          return true;
        } catch (err) {
          // console.log(err);
          return false;
        }
      },
    });
    await this.setOutputs(
      {
        s3Endpoint: "http://127.0.0.1:9001",
        s3AccessKey: "minioadmin",
        s3SecretKey: "minioadmin",
      },
      "local"
    );

    FileStorageService.process = childProcess;
  }

  async deploy(stage: string) {
    await super.deploy(stage);

    const cloudformationClient = new CloudFormation();

    const template = getTemplate({
      bucketName: this.getBucketName(stage),
      name: this.name,
    });
    const stackName = getStackName(stage, this.name);

    const results = await cloudformationClient.deployStack(stackName, template);

    const outputs = results?.Stacks?.[0].Outputs;
    await this.setOutputs(
      {
        ...Object.fromEntries(
          outputs?.map(({ OutputKey, OutputValue }) => [
            OutputKey,
            OutputValue,
          ]) ?? []
        ),
      },
      stage
    );

    return;
  }

  async getEnvironmentVariables(_: string) {
    const env: Record<string, string> = {};
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

  getPermissions(stage: string) {
    return [
      {
        Effect: "Allow" as const,
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

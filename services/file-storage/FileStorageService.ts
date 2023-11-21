import { ChildProcess, spawn } from "child_process";
import path from "path";
import { ServiceDefinition } from "../ServiceDefinition";
import { startContainer } from "../../helpers/docker";
import { S3 } from "../../helpers/aws/s3";
import { SAWS_DIR } from "../../utils/constants";
import { CloudFormation } from "../../helpers/aws/cloudformation";
import { getStackName, getTemplate } from "./cloud-formation.template";

export class FileStorageService extends ServiceDefinition {
  static process?: ChildProcess;

  getBucketName(stage: string) {
    return `${stage}-${this.name}`;
  }

  async dev() {
    await super.dev();

    await this.startS3Docker();

    await this.createBucket();
  }

  async createBucket() {
    const client = new S3();

    const buckets = await client.listBuckets();
    if (
      buckets.Buckets?.find(
        (bucket) => bucket.Name === this.getBucketName("local")
      ) == null
    ) {
      await client.createBucket(this.getBucketName("local"));
    }
  }

  async startS3Docker() {
    console.log("Starting file storage");

    if (FileStorageService.process != null) return;

    await this.setOutputs(
      {
        s3Endpoint: "http://127.0.0.1:9001",
        s3AccessKey: "minioadmin",
        s3SecretKey: "minioadmin",
      },
      "local"
    );

    process.env = {
      ...process.env,
      ...(await this.getEnvironmentVariables()),
    };
    
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
          const client = new S3();
          await client.listBuckets();
          return true;
        } catch (err) {
          // console.log(err)
          return false;
        }
      },
    });

    FileStorageService.process = childProcess;
  }

  async deploy(stage: string) {
    await super.deploy(stage)
  
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

  async getEnvironmentVariables() {
    return {
      S3_ENDPOINT: String(this.outputs.s3Endpoint),
      S3_ACCESS_KEY: String(this.outputs.s3AccessKey),
      S3_SECRET_KEY: String(this.outputs.s3SecretKey),
    };
  }

  getStdOut() {
    return FileStorageService.process?.stdout;
  }

  getPermissions(stage: string) {
    return [
      {
        Effect: "Allow" as const,
        Action: ["s3:*"],
        Resource: {
          "Fn::Sub": `arn:aws:s3:::${this.getBucketName(stage)}`,
        },
      },
    ];
  }

  exit() {
    FileStorageService.process?.kill();
    FileStorageService.process = undefined;
  }
}
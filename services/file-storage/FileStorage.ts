import { ChildProcess, spawn } from "child_process";
import path from "path";
import { ServiceDefinition } from "../ServiceDefinition";
import { startContainer } from "../../helpers/docker";
import { S3 } from "../../helpers/aws/s3";
import { SAWS_DIR } from "../../utils/constants";

export class FileStorage extends ServiceDefinition {
  process?: ChildProcess;

  getBucketName(stage: string) {
    return `${stage}-${this.name}-file-storage`;
  }

  async dev() {
    await this.startS3Docker();
  }

  async startS3Docker() {
    console.log("Starting file storage");

    const client = new S3();
    const childProcess = await startContainer({
      name: this.name,
      image: "minio/minio",
      command: ["server", "/data", "--console-address", ":9001"],
      additionalArguments: [
        "-p",
        "9000:9000",
        "-p",
        "9001:9001",
        "-v",
        `${path.resolve(SAWS_DIR, "s3")}/:/data`,
      ],
      check: async () => {
        try {
          await client.listBuckets();
          return true;
        } catch (_) {
          return false;
        }
      },
    });

    await this.setOutputs(
      {
        s3Endpoint: "http://127.0.0.1:9000",
        s3AccessKey: "minioadmin",
        s3SecretKey: "minioadmin",
      },
      "local"
    );

    process.env = {
      ...process.env,
      ...(await this.getEnvironmentVariables()),
    };

    const buckets = await client.listBuckets();
    if (
      buckets.Buckets?.find(
        (bucket) => bucket.Name === this.getBucketName("local")
      ) == null
    ) {
      await client.createBucket(this.getBucketName("local"));
    }

    this.process = childProcess;
  }

  async deploy(stage: string) {
    // TODO
  }

  async getEnvironmentVariables() {
    return {
      [this.parameterizedEnvVarName("S3_ENDPOINT")]: String(
        this.outputs.s3Endpoint
      ),
      [this.parameterizedEnvVarName("S3_ACCESS_KEY")]: String(
        this.outputs.s3AccessKey
      ),
      [this.parameterizedEnvVarName("S3_SECRET_KEY")]: String(
        this.outputs.s3SecretKey
      ),
    };
  }

  getStdOut() {
    return this.process?.stdout;
  }

  getPermissions() {
    return [];
  }

  exit() {
    this.process?.kill();
    this.process = undefined;
  }
}

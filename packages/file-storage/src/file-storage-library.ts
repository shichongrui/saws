import { S3 } from "@shichongrui/saws-aws/s3";
import type { GetObjectCommandOutput, S3ClientConfig } from '@aws-sdk/client-s3'

export class FileStorage {
  name: string;
  client: S3;

  constructor(name: string) {
    this.name = name;
    const config: S3ClientConfig = {}
    if (process.env.STAGE === 'local') {
      config.endpoint = process.env.S3_ENDPOINT,
      config.credentials = {
        accessKeyId: String(process.env.S3_ACCESS_KEY),
        secretAccessKey: String(process.env.S3_SECRET_KEY)
      }
      config.region = 'us-west-2'
    }
    this.client = new S3(config);
  }

  getBucketName() {
    return `${process.env.STAGE}-${this.name}`;
  }

  async getFile(path: string): Promise<GetObjectCommandOutput> {
    const response = await this.client.getFile(this.getBucketName(), path);
    return response;
  }

  async getFileUrl(path: string) {
    const response = await this.client.getPresignedFileUrl(
      this.getBucketName(),
      path
    );
    return response;
  }

  async getFileUploadUrl(path: string) {
    const response = await this.client.getPresignedUploadUrl(
      this.getBucketName(),
      path
    );
    return response;
  }

  async writeFile(path: string, file: Uint8Array) {
    const response = await this.client.uploadFile(
      this.getBucketName(),
      path,
      file
    );
    return response;
  }

  async deleteFile(path: string) {
    await this.client.deleteObject(this.getBucketName(), path);
  }

  async listFiles(path: string) {
    const response = await this.client.listObjects(this.getBucketName(), path)
    console.log(response)
    return response.Contents
  }
}

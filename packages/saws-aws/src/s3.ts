import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListBucketsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { promises as fs } from "fs";
import mime from 'mime';

export class S3 {
  client: S3Client
  
  constructor() {
    const config: S3ClientConfig = {}
    if (process.env.S3_ENDPOINT != null) {
      config.endpoint = process.env.S3_ENDPOINT
    }

    if (process.env.S3_ACCESS_KEY != null || process.env.S3_SECRET_KEY != null) {
      config.credentials = {
        accessKeyId: String(process.env.S3_ACCESS_KEY),
        secretAccessKey: String(process.env.S3_SECRET_KEY)
      }
    }
    this.client = new S3Client(config);
  }
  
  async uploadFileFromPath(
    bucketName: string,
    key: string,
    filePath: string
  ) {
    const file = await fs.readFile(filePath);
    return this.uploadFile(bucketName, key, file)
  };

  uploadFile(
    bucketName: string,
    key: string,
    file: Uint8Array,
  ) {
    const contentType = mime.getType(key)

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Body: file,
      Key: key,
      ContentType: contentType ?? undefined
    })

    return this.client.send(command)
  }
  
  async doesFileExist(bucketName: string, key: string) {
    const command = new HeadObjectCommand({
      Bucket: bucketName,
      Key: key,
    });
  
    try {
      await this.client.send(command);
      return true;
    } catch (err: any) {
      if (err.name === "NotFound") {
        return false;
      }
  
      throw err;
    }
  };

  getFile(bucketName: string, key: string) {
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    })

    return this.client.send(command)
  }

  getPresignedFileUrl(bucketName: string, key: string) {
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    })
    return getSignedUrl(this.client, command, { expiresIn: 3600 })
  }

  getPresignedUploadUrl(bucketName: string, key: string) {
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
    })
    return getSignedUrl(this.client, command, { expiresIn: 3600 })
  }

  listBuckets() {
    const command = new ListBucketsCommand({})
    return this.client.send(command)
  }

  createBucket(bucketName: string) {
    const command = new CreateBucketCommand({
      Bucket: bucketName,
    })
    return this.client.send(command)
  }

  listObjects(bucketName: string, prefix?: string, delimiter?: string,) {
    const command = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: prefix,
      Delimiter: delimiter,
    })
    return this.client.send(command)
  }
}

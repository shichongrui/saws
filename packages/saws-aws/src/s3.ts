import {
  GetObjectCommand,
  HeadObjectCommand,
  ListBucketsCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { promises as fs } from "fs";
import mime from 'mime';

export class S3 {
  client: S3Client
  
  constructor() {
    this.client = new S3Client({});
  }
  
  async uploadFileFromPath(
    bucketName: string,
    key: string,
    filePath: string
  ) {
    const file = await fs.readFile(filePath);

    const contentType = mime.getType(filePath);

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Body: file,
      Key: key,
      ContentType: contentType ?? undefined,
    });
  
    await this.client.send(command);
  };
  
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
}

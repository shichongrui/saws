import {
  HeadObjectCommand,
  PutObjectCommand,
  DeleteObjectsCommand,
  ListObjectsCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { promises as fs } from "fs";
import mime from 'mime';

export class S3 {
  client: S3Client
  
  constructor() {
    this.client = new S3Client({});
  }
  
  async uploadFile(
    bucketName: string,
    key: string,
    filePath: string
  ) {
    const file = await fs.readFile(filePath);
    
    const contentType = mime.lookup(filePath)

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Body: file,
      Key: key,
      ContentType: contentType,
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
}

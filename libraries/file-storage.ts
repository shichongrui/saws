import { S3 } from '../helpers/aws/s3'

export class FileStorage {
  name: string
  client: S3

  constructor(name: string) {
    this.name = name;
    this.client = new S3()
  }

  getBucketName() {
    return `${process.env.STAGE}-${this.name}`
  }

  async getFile(path: string) {
    const response = await this.client.getFile(this.getBucketName(), path)
    return response
  }

  async getFileUrl(path: string) {
    const response = await this.client.getPresignedFileUrl(this.getBucketName(), path)
    return response
  }

  async getFileUploadUrl(path: string) {
    const response = await this.client.getPresignedUploadUrl(this.getBucketName(), path)
    return response
  }

  async writeFile(path: string, file: Uint8Array) {
    const response = await this.client.uploadFile(this.getBucketName(), path, file)
    return response
  }
}
import { S3 } from '@shichongrui/saws-aws'
import { getProjectName } from '@shichongrui/saws-core'

export class FileStorage {
  name: string
  client: S3

  constructor(name: string) {
    this.name = name;
    this.client = new S3()
  }

  getBucketName() {
    return `${process.env.STAGE}-${this.name}-file-storage`
  }

  async getFile(path: string) {
    const response = await this.client.getFile(this.getBucketName(), path)
    return response.Body
  }

  async getFileUploadUrl(path: string) {
    const response = await this.client.getPresignedUploadUrl(this.getBucketName(), path)
    return response
  }
}
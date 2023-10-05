import { S3 } from '@shichongrui/saws-aws'

export class FileStorage {
  name: string
  client: S3

  constructor(name: string) {
    this.name = name;
    this.client = new S3()
  }

  async getFile(path: string) {
    const response = await this.client.getFile(this.name, path)
    return response.Body
  }

  async getFileUploadUrl(path: string) {
    const response = await this.client.getPresignedUploadUrl(this.name, path)
    return response
  }
}
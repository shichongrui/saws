import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';

export class STS {
  client: STSClient;

  constructor() {
    this.client = new STSClient({});
  }

  async getCallerIdentity() {
    const command = new GetCallerIdentityCommand({});
    const response = await this.client.send(command);
    return response;
  }
}
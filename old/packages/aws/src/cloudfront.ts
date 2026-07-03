import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';

export class Cloudfront {
  client: CloudFrontClient = new CloudFrontClient({})

  async createInvalidation(distributionId: string, filePath: string) {
    const command = new CreateInvalidationCommand({
      DistributionId: distributionId,
      InvalidationBatch: {
        Paths: {
          Quantity: 1,
          Items: [filePath],
        },
        CallerReference: String(Date.now()),
      }
    })

    await this.client.send(command);
  }
}
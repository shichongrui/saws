"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Cloudfront = void 0;
const client_cloudfront_1 = require("@aws-sdk/client-cloudfront");
class Cloudfront {
    client = new client_cloudfront_1.CloudFrontClient({});
    async createInvalidation(distributionId, filePath) {
        const command = new client_cloudfront_1.CreateInvalidationCommand({
            DistributionId: distributionId,
            InvalidationBatch: {
                Paths: {
                    Quantity: 1,
                    Items: [filePath],
                },
                CallerReference: String(Date.now()),
            }
        });
        await this.client.send(command);
    }
}
exports.Cloudfront = Cloudfront;

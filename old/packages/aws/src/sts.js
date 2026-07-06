"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.STS = void 0;
const client_sts_1 = require("@aws-sdk/client-sts");
class STS {
    client;
    constructor() {
        this.client = new client_sts_1.STSClient({});
    }
    async getCallerIdentity() {
        const command = new client_sts_1.GetCallerIdentityCommand({});
        const response = await this.client.send(command);
        return response;
    }
}
exports.STS = STS;

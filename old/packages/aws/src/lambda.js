"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Lambda = void 0;
const client_lambda_1 = require("@aws-sdk/client-lambda");
class Lambda {
    client;
    stage;
    constructor(stage) {
        const config = {};
        if (stage === 'local') {
            config.endpoint = 'http://localhost:9000';
            config.credentials = {
                accessKeyId: 'local-lambda',
                secretAccessKey: 'local-lambda',
            };
            config.region = 'us-west-2';
        }
        this.client = new client_lambda_1.LambdaClient(config);
        this.stage = stage;
    }
    async invoke(name, payload, config = { async: false }, context = '') {
        const command = new client_lambda_1.InvokeCommand({
            FunctionName: `${this.stage}-${name}`,
            InvocationType: config.async ? "Event" : "RequestResponse",
            Payload: Buffer.from(JSON.stringify(payload)),
            ClientContext: Buffer.from(JSON.stringify(context)).toString('base64'),
        });
        const response = await this.client.send(command);
        const responseText = new TextDecoder().decode(response.Payload);
        try {
            return JSON.parse(responseText);
        }
        catch (_) {
            return responseText;
        }
    }
}
exports.Lambda = Lambda;

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SSM = void 0;
const client_ssm_1 = require("@aws-sdk/client-ssm");
class SSM {
    client;
    constructor() {
        this.client = new client_ssm_1.SSMClient({});
    }
    async getParameter(name, decrypt = false) {
        const command = new client_ssm_1.GetParameterCommand({
            Name: name,
            WithDecryption: decrypt,
        });
        const results = await this.client.send(command);
        return results.Parameter?.Value ?? "";
    }
    ;
    async putParameter(name, value, encrypt = false) {
        const command = new client_ssm_1.PutParameterCommand({
            Name: name,
            Value: value,
            Type: encrypt ? client_ssm_1.ParameterType.SECURE_STRING : client_ssm_1.ParameterType.STRING,
        });
        await this.client.send(command);
    }
    ;
}
exports.SSM = SSM;

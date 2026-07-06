"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FunctionsClient = void 0;
const lambda_1 = require("@saws/aws/lambda");
class FunctionsClient {
    client;
    stage;
    constructor(stage = String(process.env.STAGE)) {
        this.client = new lambda_1.Lambda(stage);
        this.stage = stage;
    }
    async call(name, payload, config = { async: false }) {
        return this.client.invoke(name, payload, config);
    }
}
exports.FunctionsClient = FunctionsClient;

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RestAPI = void 0;
const API_1 = require("./API");
const serverless_http_1 = __importDefault(require("serverless-http"));
class RestAPI extends API_1.API {
    app;
    constructor(app) {
        super();
        this.app = app;
        this.app.use((req, _res, next) => {
            req.user = this.user;
            next();
        });
    }
    createLambdaHandler = () => {
        const handler = (0, serverless_http_1.default)(this.app, { provider: "aws" });
        return async (event, context) => {
            context.callbackWaitsForEmptyEventLoop = false;
            this.authenticateRequest(event);
            this.logEvent(event);
            try {
                const results = await handler(event, context);
                return results;
            }
            catch (error) {
                console.error("Error while processing request", JSON.stringify(error, null, 2));
                throw error;
            }
        };
    };
}
exports.RestAPI = RestAPI;

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.captureCognitoEnvVars = exports.CognitoClient = void 0;
const cognito_1 = require("@saws/aws/cognito");
const parameterized_env_var_name_1 = require("@saws/utils/parameterized-env-var-name");
class CognitoClient {
    client;
    userPoolId;
    userPoolClientId;
    constructor(name) {
        const userPoolId = process.env[(0, parameterized_env_var_name_1.parameterizedEnvVarName)(name, "USER_POOL_ID")];
        const userPoolClientId = process.env[(0, parameterized_env_var_name_1.parameterizedEnvVarName)(name, "USER_POOL_CLIENT_ID")];
        this.client = new cognito_1.Cognito(process.env.STAGE ?? "local");
        if (userPoolId == null || userPoolClientId == null) {
            throw new Error("USER_POOL_ID and USER_POOL_CLIENT_ID must be present in the environment variables");
        }
        this.userPoolId = userPoolId;
        this.userPoolClientId = userPoolClientId;
    }
    deleteUserFromToken(token) {
        return this.client.deleteUser(token);
    }
    async createUser(email, emailVerified) {
        const user = await this.client.createUser({
            email,
            emailVerified,
        }, this.userPoolId);
        return user;
    }
    getUser(email) {
        return this.client.getUser(this.userPoolId, email);
    }
    async refreshAccessToken(refreshToken) {
        const response = await this.client.refreshAuth(this.userPoolId, this.userPoolClientId, refreshToken);
        return response.AuthenticationResult?.AccessToken;
    }
    async initiateAuth(username, password) {
        const response = await this.client.initiateAuth(this.userPoolId, this.userPoolClientId, username, password);
        return response;
    }
}
exports.CognitoClient = CognitoClient;
const captureCognitoEnvVars = (name) => {
    const userPoolId = (0, parameterized_env_var_name_1.parameterizedEnvVarName)(name, "USER_POOL_ID");
    const userPoolClientId = (0, parameterized_env_var_name_1.parameterizedEnvVarName)(name, "USER_POOL_CLIENT_ID");
    return {
        [userPoolId]: process.env[userPoolId],
        [userPoolClientId]: process.env[userPoolClientId],
    };
};
exports.captureCognitoEnvVars = captureCognitoEnvVars;

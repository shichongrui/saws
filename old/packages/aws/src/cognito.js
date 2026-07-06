"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Cognito = void 0;
const client_cognito_identity_provider_1 = require("@aws-sdk/client-cognito-identity-provider");
class Cognito {
    client;
    constructor(stage) {
        const config = {};
        if (stage === 'local') {
            config.region = 'us-west-2';
            config.endpoint = 'http://localhost:9229';
            config.credentials = {
                accessKeyId: 'cognito-local',
                secretAccessKey: 'cognito-local'
            };
        }
        this.client = new client_cognito_identity_provider_1.CognitoIdentityProviderClient(config);
    }
    async listUserPools() {
        const command = new client_cognito_identity_provider_1.ListUserPoolsCommand({ MaxResults: 60 });
        const results = await this.client.send(command);
        return results;
    }
    async listUserPoolClients(userPoolId) {
        const command = new client_cognito_identity_provider_1.ListUserPoolClientsCommand({
            UserPoolId: userPoolId,
        });
        const results = await this.client.send(command);
        return results;
    }
    async createUserPool(name) {
        const command = new client_cognito_identity_provider_1.CreateUserPoolCommand({
            PoolName: name,
            UsernameAttributes: ["email"],
            AutoVerifiedAttributes: ["email"],
        });
        const results = await this.client.send(command);
        return results;
    }
    async createUserPoolClient(name, userPoolId) {
        const command = new client_cognito_identity_provider_1.CreateUserPoolClientCommand({
            ClientName: name,
            UserPoolId: userPoolId,
            ExplicitAuthFlows: ["ALLOW_USER_SRP_AUTH", "ALLOW_REFRESH_TOKEN_AUTH", "ALLOW_USER_PASSWORD_AUTH"],
            GenerateSecret: false,
            AccessTokenValidity: 1,
            TokenValidityUnits: {
                AccessToken: 'minutes'
            }
        });
        const results = await this.client.send(command);
        return results;
    }
    async signUpUser(userPoolClientId, username, password) {
        const command = new client_cognito_identity_provider_1.SignUpCommand({
            ClientId: userPoolClientId,
            Username: username,
            Password: password,
            UserAttributes: [
                {
                    Name: "email",
                    Value: username,
                },
            ],
        });
        const results = await this.client.send(command);
        return results;
    }
    async confirmUserSignUp(userPoolId, username) {
        const command = new client_cognito_identity_provider_1.AdminConfirmSignUpCommand({
            UserPoolId: userPoolId,
            Username: username,
        });
        const results = await this.client.send(command);
        return results;
    }
    async getUser(userPoolId, username) {
        const command = new client_cognito_identity_provider_1.AdminGetUserCommand({
            UserPoolId: userPoolId,
            Username: username,
        });
        const results = await this.client.send(command);
        return results;
    }
    async initiateAuth(userPoolId, userPoolClientId, username, password) {
        const command = new client_cognito_identity_provider_1.AdminInitiateAuthCommand({
            UserPoolId: userPoolId,
            ClientId: userPoolClientId,
            AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
            AuthParameters: {
                USERNAME: username,
                PASSWORD: password,
            },
        });
        const results = await this.client.send(command);
        return results;
    }
    async refreshAuth(userPoolId, userPoolClientId, refreshToken) {
        const command = new client_cognito_identity_provider_1.AdminInitiateAuthCommand({
            UserPoolId: userPoolId,
            ClientId: userPoolClientId,
            AuthFlow: 'REFRESH_TOKEN_AUTH',
            AuthParameters: {
                REFRESH_TOKEN: refreshToken,
            }
        });
        const results = await this.client.send(command);
        return results;
    }
    async deleteUser(token) {
        const command = new client_cognito_identity_provider_1.DeleteUserCommand({
            AccessToken: token,
        });
        const results = await this.client.send(command);
        return results;
    }
    async createUser({ email, emailVerified, }, userPoolId) {
        const command = new client_cognito_identity_provider_1.AdminCreateUserCommand({
            UserPoolId: userPoolId,
            Username: email,
            UserAttributes: [
                {
                    Name: "email",
                    Value: email,
                },
                {
                    Name: "email_verified",
                    Value: String(emailVerified)
                }
            ],
            DesiredDeliveryMediums: ["EMAIL"],
        });
        const results = await this.client.send(command);
        return results;
    }
}
exports.Cognito = Cognito;

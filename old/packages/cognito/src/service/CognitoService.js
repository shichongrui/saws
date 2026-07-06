"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CognitoService = void 0;
const cognito_1 = require("@saws/aws/cognito");
const cloudformation_1 = require("@saws/aws/cloudformation");
const core_1 = require("@saws/core");
const secrets_manager_1 = require("@saws/secrets/secrets-manager");
const constants_1 = require("@saws/utils/constants");
const generate_token_1 = require("@saws/utils/generate-token");
const node_path_1 = __importDefault(require("node:path"));
const cloud_formation_template_1 = require("./cloud-formation.template");
const docker_1 = require("@saws/utils/docker");
class CognitoService extends core_1.ServiceDefinition {
    static process;
    devUserConfig;
    constructor(config) {
        super(config);
        this.devUserConfig = config.devUser;
    }
    async dev() {
        await super.dev();
        await this.startCognitoDocker();
        const params = await this.seedCognito();
        await this.setOutputs({
            ...params,
            userPoolJwksUri: `http://localhost:9229/${params.userPoolId}/.well-known/jwks.json`,
        }, "local");
    }
    async deploy(stage) {
        await super.deploy(stage);
        console.log("Deploying Auth...");
        const cloudformationClient = new cloudformation_1.CloudFormation();
        const template = (0, cloud_formation_template_1.getTemplate)({
            stage,
            name: this.name,
        });
        const stackName = (0, cloud_formation_template_1.getStackName)(stage, this.name);
        const results = await cloudformationClient.deployStack(stackName, template);
        const outputs = results?.Stacks?.[0].Outputs;
        await this.setOutputs({
            ...Object.fromEntries(outputs?.map(({ OutputKey, OutputValue }) => [
                OutputKey,
                OutputValue,
            ]) ?? []),
        }, stage);
        return;
    }
    teardown() {
        return null;
    }
    async startCognitoDocker() {
        if (CognitoService.process != null)
            return;
        const childProcess = await (0, docker_1.startContainer)({
            name: this.name,
            image: "jagregory/cognito-local",
            additionalArguments: [
                "-p",
                "9229:9229",
                "-v",
                `${node_path_1.default.resolve(constants_1.SAWS_DIR, "cognito")}/:/app/.cognito`,
            ],
            check: async () => {
                try {
                    await new cognito_1.Cognito("local").listUserPools();
                    return true;
                }
                catch (err) {
                    return false;
                }
            },
        });
        await this.setOutputs({
            cognitoEndpoint: "http://localhost:9229",
        }, "local");
        childProcess.stderr?.pipe(process.stderr);
        childProcess.stdout?.pipe(process.stdout);
        CognitoService.process = childProcess;
    }
    async getEnvironmentVariables(_) {
        return {
            [this.parameterizedEnvVarName("USER_POOL_ID")]: String(this.getOutputs().userPoolId ?? ""),
            [this.parameterizedEnvVarName("USER_POOL_CLIENT_ID")]: String(this.getOutputs().userPoolClientId),
            [this.parameterizedEnvVarName("USER_POOL_JWKS_URI")]: String(this.getOutputs().userPoolJwksUri),
        };
    }
    getStdOut() {
        return CognitoService.process?.stdout;
    }
    async seedCognito() {
        const cognitoClient = new cognito_1.Cognito("local");
        const cognitoParams = await this.getCognitoParameters();
        const userPools = await cognitoClient.listUserPools();
        let userPool = userPools.UserPools?.find((pool) => pool.Name === cognitoParams.poolName);
        if (userPool == null) {
            const results = await cognitoClient.createUserPool(cognitoParams.poolName);
            userPool = results.UserPool;
        }
        const userPoolClients = await cognitoClient.listUserPoolClients(userPool?.Id ?? "");
        let userPoolClient = userPoolClients.UserPoolClients?.find((client) => client.ClientName === cognitoParams.clientName);
        if (userPoolClient == null) {
            const results = await cognitoClient.createUserPoolClient(cognitoParams.clientName, userPool?.Id ?? "");
            userPoolClient = results.UserPoolClient;
        }
        let userConfirmed = false;
        try {
            const results = await cognitoClient.getUser(userPool?.Id ?? "", cognitoParams.devUserEmail);
            userConfirmed = results.UserStatus !== "UNCONFIRMED";
        }
        catch (err) {
            if (err.name !== 'UserNotFoundException' && err.code !== "CognitoLocal#UserNotFoundException") {
                throw err;
            }
            const results = await cognitoClient.signUpUser(userPoolClient?.ClientId ?? "", cognitoParams.devUserEmail, cognitoParams.devUserPassword);
            userConfirmed = Boolean(results.UserConfirmed);
        }
        if (!userConfirmed) {
            await cognitoClient.confirmUserSignUp(userPool?.Id ?? "", cognitoParams.devUserEmail);
        }
        const authResults = await cognitoClient.initiateAuth(userPool?.Id ?? "", userPoolClient?.ClientId ?? "", cognitoParams.devUserEmail, cognitoParams.devUserPassword);
        return {
            userPoolId: userPool?.Id,
            userPoolName: userPool?.Name,
            userPoolClientId: userPoolClient?.ClientId,
            userPoolClientName: userPoolClient?.ClientName,
            devUserEmail: cognitoParams.devUserEmail,
            accessToken: authResults.AuthenticationResult?.AccessToken,
            idToken: authResults.AuthenticationResult?.IdToken,
            refreshToken: authResults.AuthenticationResult?.RefreshToken,
        };
    }
    async getCognitoParameters() {
        const password = this.devUserConfig?.password ?? "password";
        return {
            poolName: `local-${this.name}-user-pool`,
            clientName: `local-${this.name}-user-pool-client`,
            devUserEmail: this.devUserConfig?.email ?? `dev@${this.name}.com`,
            devUserPassword: password,
        };
    }
    async getDevUserPassword() {
        const secretsManager = new secrets_manager_1.SecretsManager(process.env.STAGE);
        try {
            const password = await secretsManager.get(constants_1.DEV_USER_PASSWORD_PARAMETER_NAME);
            return password;
        }
        catch (err) {
            if (err.name !== "ParameterNotFound")
                throw err;
            const newPassword = await (0, generate_token_1.generateToken)();
            await secretsManager.set(constants_1.DEV_USER_PASSWORD_PARAMETER_NAME, newPassword);
            return newPassword;
        }
    }
    getPermissions(stage) {
        return [
            {
                Effect: "Allow",
                Resource: {
                    "Fn::Sub": `arn:aws:cognito-idp:\${AWS::Region}:\${AWS::AccountId}:userpool/${this.outputs.userPoolId}`,
                },
                Action: [
                    "cognito-idp:AdminGetUser",
                    "cognito-idp:AdminInitiateAuth",
                    "cognito-idp:AdminCreateUser",
                ],
            },
        ];
    }
    exit() {
        CognitoService.process?.kill();
        CognitoService.process = undefined;
    }
}
exports.CognitoService = CognitoService;

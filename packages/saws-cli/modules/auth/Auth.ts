import {
  AuthConfig,
  ModuleType,
  ServiceType,
  DEV_USER_PASSWORD_PARAMETER_NAME,
  SAWS_DIR,
  retryUntil,
  getProjectName,
  generateToken,
} from "@shichongrui/saws-core";
import { ChildProcess, exec, spawn } from "child_process";
import { CloudFormation, Cognito } from "@shichongrui/saws-aws";
import path from "path";
import { ModuleDefinition, Outputs } from "../ModuleDefinition";
import { SecretsManager } from "@shichongrui/saws-secrets";
import { waitForContainerToBeStopped } from "../../shell-commands/docker";
import { getStackName, getTemplate } from "./cloud-formation.template";

export class Auth implements ModuleDefinition, AuthConfig {
  type: ServiceType.AUTH = ServiceType.AUTH;
  name: string;
  displayName: string;

  config: AuthConfig;
  outputs: Outputs = {};
  process?: ChildProcess;

  constructor(name: string, config: AuthConfig) {
    this.name = name;
    this.displayName = config.displayName ?? name;
    this.config = config;
  }

  async dev() {
    console.log("Starting Auth...");
    await this.startCognitoDocker();
    const params = await this.seedCognito();
    this.setOutputs({
      ...params,
      userPoolJwksUri: `http://localhost:9229/${params.userPoolId}/.well-known/jwks.json`
    });
  }

  async deploy(stage: string) {
    console.log("Deploying Auth...");

    const cloudformationClient = new CloudFormation();

    const template = getTemplate({
      projectName: getProjectName(),
      stage,
    });
    const stackName = getStackName(stage);

    const results = await cloudformationClient.deployStack(stackName, template);

    const outputs = results?.Stacks?.[0].Outputs;
    this.setOutputs({
      ...Object.fromEntries(
        outputs?.map(({ OutputKey, OutputValue }) => [
          OutputKey,
          OutputValue,
        ]) ?? []
      ),
    });
    return;
  }

  teardown() {
    return null;
  }

  async startCognitoDocker() {
    await waitForContainerToBeStopped("saws-cognito");

    const childProcess = spawn("docker", [
      "run",
      "--rm",
      "--name",
      "saws-cognito",
      "-p",
      "9229:9229",
      "-v",
      `${path.resolve(SAWS_DIR, "cognito")}/:/app/.cognito`,
      "jagregory/cognito-local:latest",
    ]);

    // await new Promise(r => setTimeout(r, 1000))

    await retryUntil(async () => {
      try {
        await new Cognito("local").listUserPools();
        return true;
      } catch (err) {
        return false;
      }
    }, 1000);

    this.setOutputs({
      cognitoEndpoint: "http://localhost:9229",
    });

    this.process = childProcess;
  }

  setOutputs(outputs: Outputs) {
    this.outputs = {
      ...this.outputs,
      ...outputs,
    };
  }

  getOutputs() {
    return this.outputs;
  }

  async getEnvironmentVariables() {
    return {
      USER_POOL_ID: String(this.getOutputs().userPoolId ?? ""),
      USER_POOL_CLIENT_ID: String(this.getOutputs().userPoolClientId),
      USER_POOL_JWKS_URI: String(this.getOutputs().userPoolJwksUri)
    };
  }

  getStdOut() {
    return this.process?.stdout;
  }

  async seedCognito() {
    const cognitoClient = new Cognito("local");
    const cognitoParams = await this.getCognitoParameters();

    const userPools = await cognitoClient.listUserPools();
    let userPool = userPools.UserPools?.find(
      (pool) => pool.Name === cognitoParams.poolName
    );
    if (userPool == null) {
      const results = await cognitoClient.createUserPool(
        cognitoParams.poolName
      );
      userPool = results.UserPool;
    }

    const userPoolClients = await cognitoClient.listUserPoolClients(
      userPool?.Id ?? ""
    );
    let userPoolClient = userPoolClients.UserPoolClients?.find(
      (client) => client.ClientName === cognitoParams.clientName
    );
    if (userPoolClient == null) {
      const results = await cognitoClient.createUserPoolClient(
        cognitoParams.clientName,
        userPool?.Id ?? ""
      );
      userPoolClient = results.UserPoolClient;
    }

    let userConfirmed = false;
    try {
      const results = await cognitoClient.getUser(
        userPool?.Id ?? "",
        cognitoParams.devUserEmail
      );
      userConfirmed = results.UserStatus !== "UNCONFIRMED";
    } catch (err: any) {
      if (err.code !== "CognitoLocal#UserNotFoundException") {
        throw err;
      }
      const results = await cognitoClient.signUpUser(
        userPoolClient?.ClientId ?? "",
        cognitoParams.devUserEmail,
        cognitoParams.devUserPassword
      );
      userConfirmed = Boolean(results.UserConfirmed);
    }

    if (!userConfirmed) {
      await cognitoClient.confirmUserSignUp(
        userPool?.Id ?? "",
        cognitoParams.devUserEmail
      );
    }

    const authResults = await cognitoClient.initiateAuth(
      userPool?.Id ?? "",
      userPoolClient?.ClientId ?? "",
      cognitoParams.devUserEmail,
      cognitoParams.devUserPassword
    );

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
    const password =
      this.config.devUser?.password ?? 'password';

    const projectName = getProjectName();
    return {
      poolName: `${projectName}-local-${this.name}-users`,
      clientName: `${projectName}-local-${this.name}-users-client`,
      devUserEmail: this.config.devUser?.username ?? `dev@${projectName}.com`,
      devUserPassword: password,
    };
  }

  async getDevUserPassword() {
    const secretsManager = new SecretsManager(process.env.STAGE!);
    try {

      const password = await secretsManager.get(
        DEV_USER_PASSWORD_PARAMETER_NAME
      );
      return password;
    } catch (err) {
      if ((err as Error).name !== "ParameterNotFound") throw err;

      const newPassword = await generateToken();
      await secretsManager.set(DEV_USER_PASSWORD_PARAMETER_NAME, newPassword);
      return newPassword;
    }
  }

  getPermissions(_: ModuleType, __: string) {
    return [
      {
        Effect: "Allow" as const,
        Resource: {
          "Fn::Sub": `arn:aws:cognito-idp:\${AWS::Region}:\${AWS::AccountId}:userpool/${this.outputs.userPoolId}`,
        },
        Action: ["cognito-idp:AdminGetUser", "cognito-idp:AdminInitiateAuth"],
      },
    ];
  }

  exit() {
    this.process?.kill();
    exec("docker stop saws-cognito");
  }
}
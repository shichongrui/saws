import { Cognito } from "@saws/aws/cognito";
import { CloudFormation } from "@saws/aws/cloudformation";
import {
  ServiceDefinition,
  ServiceDefinitionConfig,
} from "@saws/core";
import { SecretsManager } from "@saws/secrets/secrets-manager";
import {
  DEV_USER_PASSWORD_PARAMETER_NAME,
  SAWS_DIR,
} from "@saws/utils/constants";
import { generateToken } from "@saws/utils/generate-token";
import { ChildProcess } from "node:child_process";
import path from "node:path";
import { getStackName, getTemplate } from "./cloud-formation.template";
import { startContainer } from "@saws/utils/docker";

interface CognitoServiceConfig extends ServiceDefinitionConfig {
  devUser?: {
    email: string;
    password: string;
  };
}

export class CognitoService extends ServiceDefinition {
  static process?: ChildProcess;
  devUserConfig?: { email: string; password: string };

  constructor(config: CognitoServiceConfig) {
    super(config);
    this.devUserConfig = config.devUser;
  }

  async dev() {
    await super.dev();

    await this.startCognitoDocker();
    const params = await this.seedCognito();
    await this.setOutputs(
      {
        ...params,
        userPoolJwksUri: `http://localhost:9229/${params.userPoolId}/.well-known/jwks.json`,
      },
      "local"
    );
  }

  async deploy(stage: string) {
    await super.deploy(stage);

    console.log("Deploying Auth...");

    const cloudformationClient = new CloudFormation();

    const template = getTemplate({
      stage,
      name: this.name,
    });
    const stackName = getStackName(stage, this.name);

    const results = await cloudformationClient.deployStack(stackName, template);

    const outputs = results?.Stacks?.[0].Outputs;
    await this.setOutputs(
      {
        ...Object.fromEntries(
          outputs?.map(({ OutputKey, OutputValue }) => [
            OutputKey,
            OutputValue,
          ]) ?? []
        ),
      },
      stage
    );

    return;
  }

  teardown() {
    return null;
  }

  async startCognitoDocker() {
    if (CognitoService.process != null) return

    const childProcess = await startContainer({
      name: this.name,
      image: "jagregory/cognito-local",
      additionalArguments: [
        "-p",
        "9229:9229",
        "-v",
        `${path.resolve(SAWS_DIR, "cognito")}/:/app/.cognito`,
      ],
      check: async () => {
        try {
          await new Cognito("local").listUserPools();
          return true;
        } catch (err) {
          return false;
        }
      },
    });

    await this.setOutputs(
      {
        cognitoEndpoint: "http://localhost:9229",
      },
      "local"
    );

    childProcess.stderr?.pipe(process.stderr)
    childProcess.stdout?.pipe(process.stdout)
    CognitoService.process = childProcess;
  }

  async getEnvironmentVariables(_: string) {
    return {
      [this.parameterizedEnvVarName("USER_POOL_ID")]: String(
        this.getOutputs().userPoolId ?? ""
      ),
      [this.parameterizedEnvVarName("USER_POOL_CLIENT_ID")]: String(
        this.getOutputs().userPoolClientId
      ),
      [this.parameterizedEnvVarName("USER_POOL_JWKS_URI")]: String(
        this.getOutputs().userPoolJwksUri
      ),
    };
  }

  getStdOut() {
    return CognitoService.process?.stdout;
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
      if (err.name !== 'UserNotFoundException' && err.code !== "CognitoLocal#UserNotFoundException") {
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
    const password = this.devUserConfig?.password ?? "password";

    return {
      poolName: `local-${this.name}-user-pool`,
      clientName: `local-${this.name}-user-pool-client`,
      devUserEmail: this.devUserConfig?.email ?? `dev@${this.name}.com`,
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

  getPermissions(stage: string) {
    return [
      {
        Effect: "Allow" as const,
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

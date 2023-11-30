import {
  CognitoIdentityProviderClient,
  ListUserPoolsCommand,
  ListUserPoolClientsCommand,
  CreateUserPoolCommand,
  CreateUserPoolClientCommand,
  SignUpCommand,
  AdminConfirmSignUpCommand,
  AdminGetUserCommand,
  AdminInitiateAuthCommand,
  DeleteUserCommand,
  AdminCreateUserCommand,
  CognitoIdentityProviderClientConfig,
} from "@aws-sdk/client-cognito-identity-provider";

export class Cognito {
  client: CognitoIdentityProviderClient;

  constructor(stage: string) {
    const config: CognitoIdentityProviderClientConfig = {}

    if (stage === 'local') {
      config.endpoint = 'http://localhost:9229'
      config.credentials = {
        accessKeyId: 'cognito-local',
        secretAccessKey: 'cognito-local'
      }
    }

    this.client = new CognitoIdentityProviderClient(config);
  }

  async listUserPools() {
    const command = new ListUserPoolsCommand({ MaxResults: 60 });

    const results = await this.client.send(command);
    return results;
  }

  async listUserPoolClients(userPoolId: string) {
    const command = new ListUserPoolClientsCommand({
      UserPoolId: userPoolId,
    });

    const results = await this.client.send(command);
    return results;
  }

  async createUserPool(name: string) {
    const command = new CreateUserPoolCommand({
      PoolName: name,
      UsernameAttributes: ["email"],
      AutoVerifiedAttributes: ["email"],
    });
    const results = await this.client.send(command);
    return results;
  }

  async createUserPoolClient(name: string, userPoolId: string) {
    const command = new CreateUserPoolClientCommand({
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

  async signUpUser(
    userPoolClientId: string,
    username: string,
    password: string
  ) {
    const command = new SignUpCommand({
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

  async confirmUserSignUp(userPoolId: string, username: string) {
    const command = new AdminConfirmSignUpCommand({
      UserPoolId: userPoolId,
      Username: username,
    });
    const results = await this.client.send(command);
    return results;
  }

  async getUser(userPoolId: string, username: string) {
    const command = new AdminGetUserCommand({
      UserPoolId: userPoolId,
      Username: username,
    });
    const results = await this.client.send(command);
    return results;
  }

  async initiateAuth(
    userPoolId: string,
    userPoolClientId: string,
    username: string,
    password: string
  ) {
    const command = new AdminInitiateAuthCommand({
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

  async refreshAuth(
    userPoolId: string,
    userPoolClientId: string,
    refreshToken: string,
  ) {
    const command = new AdminInitiateAuthCommand({
      UserPoolId: userPoolId,
      ClientId: userPoolClientId,
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      AuthParameters: {
        REFRESH_TOKEN: refreshToken,
      }
    })

    const results = await this.client.send(command);
    return results;
  }

  async deleteUser(token: string) {
    const command = new DeleteUserCommand({
      AccessToken: token,
    });

    const results = await this.client.send(command);
    return results;
  }

  async createUser(
    {
      email,
      emailVerified,
    }: {
      email: string;
      emailVerified: boolean;
    },
    userPoolId: string
  ) {
    const command = new AdminCreateUserCommand({
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

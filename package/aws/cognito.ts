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
} from "@aws-sdk/client-cognito-identity-provider";

export class Cognito {
  client: CognitoIdentityProviderClient;

  constructor(stage: string) {
    this.client = new CognitoIdentityProviderClient({
      endpoint: stage === 'local' ? 'http://localhost:9229' : undefined,
    });
  }
  
  async listUserPools() {
    const command = new ListUserPoolsCommand({ MaxResults: 60 });
  
    const results = await this.client.send(command);
    return results;
  }
  
  async listUserPoolClients(userPoolId: string) {
    const command = new ListUserPoolClientsCommand({
      UserPoolId: userPoolId
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

  async createUserPoolClient (
    name: string,
    userPoolId: string
  ) {
    const command = new CreateUserPoolClientCommand({
      ClientName: name,
      UserPoolId: userPoolId,
      ExplicitAuthFlows: ["ALLOW_USER_SRP_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"],
      GenerateSecret: false,
    });
    const results = await this.client.send(command);
    return results;
  }

  async signUpUser(
    userPoolClientId: string,
    username: string,
    password: string,
  ) {
    const command = new SignUpCommand({
      ClientId: userPoolClientId,
      Username: username,
      Password: password,
      UserAttributes: [{
        Name: 'email',
        Value: username
      }],
    });
    const results = await this.client.send(command);
    return results;
  }
  
  async confirmUserSignUp(
    userPoolId: string,
    username: string,
  ) {
    const command = new AdminConfirmSignUpCommand({
      UserPoolId: userPoolId,
      Username: username,
    });
    const results = await this.client.send(command);
    return results;
  }
  
  async getUser(
    userPoolId: string,
    username: string,
  ) {
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
    password: string,
  ) {
    const command = new AdminInitiateAuthCommand({
      UserPoolId: userPoolId,
      ClientId: userPoolClientId,
      AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
      AuthParameters: {
        USERNAME: username,
        PASSWORD: password,
      }
    });
  
    const results = await this.client.send(command);
    return results;
  }
}


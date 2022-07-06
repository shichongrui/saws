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

// This client will always be used locally
let client: CognitoIdentityProviderClient | null;
const getClient = (stage: string = (process.env.STAGE as string)) => {
  if (client != null) return client;
  client = new CognitoIdentityProviderClient({
    endpoint: stage === 'local' ? "http://localhost:9229" : undefined,
  });
  return client;
}

export const listUserPools = async () => {
  const command = new ListUserPoolsCommand({ MaxResults: 60 });

  const results = await getClient().send(command);
  return results;
};

export const listUserPoolClients = async (userPoolId: string) => {
  const command = new ListUserPoolClientsCommand({
    UserPoolId: userPoolId
  });

  const results = await getClient().send(command);
  return results;
};

export const createUserPool = async (name: string) => {
  const command = new CreateUserPoolCommand({
    PoolName: name,
    UsernameAttributes: ["email"],
    AutoVerifiedAttributes: ["email"],
  });
  const results = await getClient().send(command);
  return results;
};

export const createUserPoolClient = async (
  name: string,
  userPoolId: string
) => {
  const command = new CreateUserPoolClientCommand({
    ClientName: name,
    UserPoolId: userPoolId,
    ExplicitAuthFlows: ["ALLOW_USER_SRP_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"],
    GenerateSecret: false,
  });
  const results = await getClient().send(command);
  return results;
};

export const signUpUser = async (
  userPoolClientId: string,
  username: string,
  password: string,
) => {
  const command = new SignUpCommand({
    ClientId: userPoolClientId,
    Username: username,
    Password: password,
    UserAttributes: [{
      Name: 'email',
      Value: username
    }],
  });
  const results = await getClient().send(command);
  return results;
}

export const confirmUserSignUp = async (
  userPoolId: string,
  username: string,
) => {
  const command = new AdminConfirmSignUpCommand({
    UserPoolId: userPoolId,
    Username: username,
  });
  const results = await getClient().send(command);
  return results;
}

export const getUser = async (
  userPoolId: string,
  username: string,
) => {
  const command = new AdminGetUserCommand({
    UserPoolId: userPoolId,
    Username: username,
  });
  const results = await getClient().send(command);
  return results;
}

export const initiateAuth = async (
  userPoolId: string,
  userPoolClientId: string,
  username: string,
  password: string,
) => {
  const command = new AdminInitiateAuthCommand({
    UserPoolId: userPoolId,
    ClientId: userPoolClientId,
    AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
    AuthParameters: {
      USERNAME: username,
      PASSWORD: password,
    }
  });

  const results = await getClient().send(command);
  return results;
}
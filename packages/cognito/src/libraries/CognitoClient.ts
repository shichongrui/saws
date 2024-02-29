import { Cognito } from "@shichongrui/saws-aws/cognito";
import { parameterizedEnvVarName } from "@shichongrui/saws-utils/parameterized-env-var-name";
import type {
  DeleteUserCommandOutput,
  AdminCreateUserCommandOutput,
  AdminGetUserCommandOutput,
} from "@aws-sdk/client-cognito-identity-provider";

export class CognitoClient {
  client: Cognito;
  userPoolId: string;
  userPoolClientId: string;

  constructor(name: string) {
    const userPoolId =
      process.env[parameterizedEnvVarName(name, "USER_POOL_ID")];
    const userPoolClientId =
      process.env[parameterizedEnvVarName(name, "USER_POOL_CLIENT_ID")];
    this.client = new Cognito(process.env.STAGE ?? "local");
    if (userPoolId == null || userPoolClientId == null) {
      throw new Error(
        "USER_POOL_ID and USER_POOL_CLIENT_ID must be present in the environment variables"
      );
    }
    this.userPoolId = userPoolId;
    this.userPoolClientId = userPoolClientId;
  }

  deleteUserFromToken(token: string): Promise<DeleteUserCommandOutput> {
    return this.client.deleteUser(token);
  }

  async createUser(email: string, emailVerified: boolean): Promise<AdminCreateUserCommandOutput> {
    const user = await this.client.createUser(
      {
        email,
        emailVerified,
      },
      this.userPoolId
    );
    return user;
  }

  getUser(email: string): Promise<AdminGetUserCommandOutput> {
    return this.client.getUser(this.userPoolId, email);
  }

  async refreshAccessToken(refreshToken: string) {
    const response = await this.client.refreshAuth(
      this.userPoolId,
      this.userPoolClientId,
      refreshToken
    );

    return response.AuthenticationResult?.AccessToken;
  }
}

export const captureCognitoEnvVars = (name: string) => {
  const userPoolId = parameterizedEnvVarName(name, "USER_POOL_ID");
  const userPoolClientId = parameterizedEnvVarName(name, "USER_POOL_CLIENT_ID");
  return {
    [userPoolId]: process.env[userPoolId],
    [userPoolClientId]: process.env[userPoolClientId],
  };
};

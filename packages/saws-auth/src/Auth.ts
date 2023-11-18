import { Cognito } from "@shichongrui/saws-aws";

export class AuthClient {
  client: Cognito;
  userPoolId: string;
  userPoolClientId: string;

  constructor(
    stage = process.env.STAGE ?? "local",
    userPoolId = process.env.USER_POOL_ID,
    userPoolClientId = process.env.USER_POOL_CLIENT_ID
  ) {
    this.client = new Cognito(process.env.STAGE ?? "local");
    if (userPoolId == null || userPoolClientId == null) {
      throw new Error(
        "USER_POOL_ID and USER_POOL_CLIENT_ID must be present in the environment variables"
      );
    }
    this.userPoolId = userPoolId;
    this.userPoolClientId = userPoolClientId;
  }

  deleteUserFromToken(token: string) {
    return this.client.deleteUser(token);
  }

  async createUser(email: string, emailVerified: boolean) {
    const user = await this.client.createUser(
      {
        email,
        emailVerified,
      },
      this.userPoolId
    );
    return user;
  }

  getUser(email: string) {
    return this.client.getUser(this.userPoolId, email);
  }

  async refreshAccessToken(refreshToken: string) {
    const response = await this.client.refreshAuth(
      this.userPoolId,
      this.userPoolClientId,
      refreshToken
    );

    return response.AuthenticationResult?.AccessToken
  }
}

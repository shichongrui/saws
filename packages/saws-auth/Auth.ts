import { Cognito } from "@shichongrui/saws-utils/aws/cognito";

export class Auth {
  client: Cognito;

  constructor() {
    this.client = new Cognito(process.env.STAGE ?? "local");
  }

  deleteUserFromToken(token: string) {
    return this.client.deleteUser(token);
  }

  async createUser(email: string, emailVerified: boolean, userPoolId: string) {
    const user = await this.client.createUser({
      email,
      emailVerified,
    }, userPoolId)
    return user
  }

  getUser(email: string, userPoolId: string) {
    return this.client.getUser(userPoolId, email)
  }
}

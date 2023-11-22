import { Cognito } from "../helpers/aws/cognito";
import { parameterizedEnvVarName } from "../utils/parameterized-env-var-name";
import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserAttribute,
  CognitoUserPool,
  CognitoUserSession,
  CookieStorage,
  ISignUpResult,
} from "amazon-cognito-identity-js";

export class AuthClient {
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

    return response.AuthenticationResult?.AccessToken;
  }
}

export const captureAuthEnvVars = (name: string) => {
  const userPoolId = parameterizedEnvVarName(name, 'USER_POOL_ID')
  const userPoolClientId = parameterizedEnvVarName(name, 'USER_POOL_CLIENT_ID')
  return {
      [userPoolId]: process.env[userPoolId],
      [userPoolClientId]: process.env[userPoolClientId],
  }
}

// For use in the front end
export class SessionClient {
  userPool: CognitoUserPool  

  constructor(name: string) {
    const userPoolId = window.ENV[parameterizedEnvVarName(name, 'USER_POOL_ID')]
    const userPoolClientId = window.ENV[parameterizedEnvVarName(name, 'USER_POOL_CLIENT_ID')]

    this.userPool = new CognitoUserPool({
      UserPoolId: userPoolId,
      ClientId: userPoolClientId,
      endpoint: window.ENV.STAGE === "local" ? "http://127.0.0.1:9229" : undefined,
      Storage: new CookieStorage({
        domain: window?.location?.hostname,
        secure: window?.location?.hostname !== "localhost",
        path: "/",
        expires: 365,
      }),
    });
  };
  
  getCurrentUser() {
    return this.userPool.getCurrentUser();
  };
  
  async signIn(username: string, password: string) {
    return new Promise<CognitoUser>((resolve, reject) => {
      const cognitoUser = new CognitoUser({
        Username: username,
        Pool: this.userPool,
        Storage: new CookieStorage({
          domain: window?.location?.hostname,
          secure: window?.location?.hostname !== "localhost",
          path: "/",
          expires: 365,
        }),
      });
      cognitoUser.setAuthenticationFlowType('USER_PASSWORD_AUTH')
      cognitoUser.authenticateUser(
        new AuthenticationDetails({ Username: username, Password: password }),
        {
          onSuccess: () => {
            resolve(cognitoUser);
          },
          onFailure: (err) => {
            reject(err);
          },
        }
      );
    });
  };
  
  async signUp({
    username,
    password,
    attributes,
    autoSignIn,
  }: {
    username: string;
    password: string;
    attributes: Record<string, string>;
    autoSignIn: {
      enabled: true;
    };
  }) {
    return new Promise<ISignUpResult | undefined>((resolve, reject) => {
      const attributeList = [];
  
      for (const key in attributes) {
        attributeList.push(
          new CognitoUserAttribute({
            Name: key,
            Value: attributes[key],
          })
        );
      }
  
      this.userPool.signUp(
        username,
        password,
        attributeList,
        [],
        async (err, result) => {
          if (err) {
            reject(err);
            return;
          }
  
          if (autoSignIn && autoSignIn.enabled) {
            try {
              await this.signIn(username, password);
              resolve(result);
            } catch (signInError) {
              reject(signInError);
            }
          } else {
            resolve(result);
          }
        }
      );
    });
  };
  
  async confirmSignUp(email: string, code: string) {
    return new Promise((resolve, reject) => {
      const userData = {
        Username: email,
        Pool: this.userPool,
        Storage: new CookieStorage({
          domain: window?.location?.hostname,
          secure: window?.location?.hostname !== "localhost",
          path: "/",
          expires: 365,
        }),
      };
      const cognitoUser = new CognitoUser(userData);
      cognitoUser.confirmRegistration(code, true, (err) => {
        if (err) return reject(err);
        resolve(null);
      });
    });
  };
  
  async completeNewPassword(
    user: CognitoUser,
    newPassword: string
  ) {
    return new Promise((resolve, reject) => {
      user.completeNewPasswordChallenge(newPassword, null, {
        onSuccess: () => {
          resolve(null);
        },
        onFailure: (err) => {
          reject(err);
        },
      });
    });
  };
  
  signOut() {
    return this.getCurrentUser()?.signOut();
  };
  
  refreshTokenIfNeeded () {
    const currentUser = this.getCurrentUser();
    currentUser?.getSession((err: Error, session: CognitoUserSession | null) => {
      if (err != null || session == null) return currentUser.signOut();
  
      if (session.isValid()) return;
  
      const refreshToken = session.getRefreshToken();
      currentUser.refreshSession(refreshToken, (err) => {
        if (err == null) return;
        currentUser.signOut();
      });
    });
  };
  
}
import { parameterizedEnvVarName } from "@shichongrui/saws-utils/parameterized-env-var-name";
import {
  type ISignUpResult,
  type CognitoUserSession,
  AuthenticationDetails,
  CognitoUser,
  CognitoUserAttribute,
  CognitoUserPool,
  CookieStorage,
} from "amazon-cognito-identity-js";


// For use in the front end
export class SessionClient {
  userPool: CognitoUserPool;

  autoSignInEnabled: boolean;
  password?: string;

  constructor(name: string) {
    const userPoolId =
      window.ENV[parameterizedEnvVarName(name, "USER_POOL_ID")];
    const userPoolClientId =
      window.ENV[parameterizedEnvVarName(name, "USER_POOL_CLIENT_ID")];

    this.userPool = new CognitoUserPool({
      UserPoolId: userPoolId,
      ClientId: userPoolClientId,
      endpoint:
        window.ENV.STAGE === "local" ? "http://127.0.0.1:9229" : undefined,
      Storage: new CookieStorage({
        domain: window?.location?.hostname,
        secure: window?.location?.hostname !== "localhost",
        path: "/",
        expires: 365,
      }),
    });

    this.autoSignInEnabled = false;
  }

  getCurrentUser() {
    return this.userPool.getCurrentUser();
  }

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
      cognitoUser.setAuthenticationFlowType("USER_PASSWORD_AUTH");
      cognitoUser.authenticateUser(
        new AuthenticationDetails({ Username: username, Password: password }),
        {
          newPasswordRequired: () => {
            cognitoUser.challengeName = "NEW_PASSWORD_REQUIRED";
            resolve(cognitoUser);
          },
          onSuccess: () => {
            resolve(cognitoUser);
          },
          onFailure: (err) => {
            reject(err);
          },
        }
      );
    });
  }

  async signUp({
    username,
    password,
    attributes,
    autoSignIn,
  }: {
    username: string;
    password: string;
    attributes: Record<string, string>;
    autoSignIn?: {
      enabled: true;
    };
  }) {
    return new Promise<ISignUpResult | undefined>((resolve, reject) => {
      this.autoSignInEnabled = autoSignIn?.enabled ?? false;
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

          if (result?.userConfirmed && autoSignIn && autoSignIn.enabled) {
            try {
              await this.signIn(username, password);
              resolve(result);
            } catch (signInError) {
              reject(signInError);
            }
          } else {
            this.password = password;
            resolve(result);
          }
        }
      );
    });
  }

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

        if (this.autoSignInEnabled && this.password != null) {
          this.signIn(email, this.password).then(resolve).catch(reject);
          this.password = undefined;
          return;
        }

        resolve(null);
      });
    });
  }

  async completeNewPassword(user: CognitoUser, newPassword: string) {
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
  }

  async setNewPassword({
    username,
    code,
    newPassword,
    autoSignIn,
  }: {
    username: string;
    code: string;
    newPassword: string;
    autoSignIn?: {
      enabled: boolean;
    };
  }) {
    return new Promise((resolve, reject) => {
      const user = new CognitoUser({
        Username: username,
        Pool: this.userPool,
        Storage: new CookieStorage({
          domain: window?.location?.hostname,
          secure: window?.location?.hostname !== "localhost",
          path: "/",
          expires: 365,
        }),
      });

      user.confirmPassword(code, newPassword, {
        onSuccess: () => {
          if (autoSignIn?.enabled) {
            resolve(this.signIn(username, newPassword));
            return
          }
          resolve(null);
        },
        onFailure: (err) => {
          reject(err);
        },
      });
    });
  }

  signOut() {
    return this.getCurrentUser()?.signOut();
  }

  refreshTokenIfNeeded() {
    const currentUser = this.getCurrentUser();
    currentUser?.getSession(
      (err: Error, session: CognitoUserSession | null) => {
        if (err != null || session == null) return currentUser.signOut();

        if (session.isValid()) return;

        const refreshToken = session.getRefreshToken();
        currentUser.refreshSession(refreshToken, (err) => {
          if (err == null) return;
          currentUser.signOut();
        });
      }
    );
  }
}

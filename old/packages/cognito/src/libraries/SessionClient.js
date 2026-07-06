"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionClient = void 0;
const parameterized_env_var_name_1 = require("@saws/utils/parameterized-env-var-name");
const amazon_cognito_identity_js_1 = require("amazon-cognito-identity-js");
// For use in the front end
class SessionClient {
    userPool;
    autoSignInEnabled;
    password;
    constructor(name) {
        const userPoolId = window.ENV[(0, parameterized_env_var_name_1.parameterizedEnvVarName)(name, "USER_POOL_ID")];
        const userPoolClientId = window.ENV[(0, parameterized_env_var_name_1.parameterizedEnvVarName)(name, "USER_POOL_CLIENT_ID")];
        this.userPool = new amazon_cognito_identity_js_1.CognitoUserPool({
            UserPoolId: userPoolId,
            ClientId: userPoolClientId,
            endpoint: window.ENV.STAGE === "local" ? "http://127.0.0.1:9229" : undefined,
            Storage: new amazon_cognito_identity_js_1.CookieStorage({
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
    async signIn(username, password) {
        return new Promise((resolve, reject) => {
            const cognitoUser = new amazon_cognito_identity_js_1.CognitoUser({
                Username: username,
                Pool: this.userPool,
                Storage: new amazon_cognito_identity_js_1.CookieStorage({
                    domain: window?.location?.hostname,
                    secure: window?.location?.hostname !== "localhost",
                    path: "/",
                    expires: 365,
                }),
            });
            cognitoUser.setAuthenticationFlowType("USER_PASSWORD_AUTH");
            cognitoUser.authenticateUser(new amazon_cognito_identity_js_1.AuthenticationDetails({ Username: username, Password: password }), {
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
            });
        });
    }
    async signUp({ username, password, attributes, autoSignIn, }) {
        return new Promise((resolve, reject) => {
            this.autoSignInEnabled = autoSignIn?.enabled ?? false;
            const attributeList = [];
            for (const key in attributes) {
                attributeList.push(new amazon_cognito_identity_js_1.CognitoUserAttribute({
                    Name: key,
                    Value: attributes[key],
                }));
            }
            this.userPool.signUp(username, password, attributeList, [], async (err, result) => {
                if (err) {
                    reject(err);
                    return;
                }
                if (result?.userConfirmed && autoSignIn && autoSignIn.enabled) {
                    try {
                        await this.signIn(username, password);
                        resolve(result);
                    }
                    catch (signInError) {
                        reject(signInError);
                    }
                }
                else {
                    this.password = password;
                    resolve(result);
                }
            });
        });
    }
    async confirmSignUp(email, code) {
        return new Promise((resolve, reject) => {
            const userData = {
                Username: email,
                Pool: this.userPool,
                Storage: new amazon_cognito_identity_js_1.CookieStorage({
                    domain: window?.location?.hostname,
                    secure: window?.location?.hostname !== "localhost",
                    path: "/",
                    expires: 365,
                }),
            };
            const cognitoUser = new amazon_cognito_identity_js_1.CognitoUser(userData);
            cognitoUser.confirmRegistration(code, true, (err) => {
                if (err)
                    return reject(err);
                if (this.autoSignInEnabled && this.password != null) {
                    this.signIn(email, this.password).then(resolve).catch(reject);
                    this.password = undefined;
                    return;
                }
                resolve(null);
            });
        });
    }
    async completeNewPassword(user, newPassword) {
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
    async setNewPassword({ username, code, newPassword, autoSignIn, }) {
        return new Promise((resolve, reject) => {
            const user = new amazon_cognito_identity_js_1.CognitoUser({
                Username: username,
                Pool: this.userPool,
                Storage: new amazon_cognito_identity_js_1.CookieStorage({
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
                        return;
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
        currentUser?.getSession((err, session) => {
            if (err != null || session == null)
                return currentUser.signOut();
            if (session.isValid())
                return;
            const refreshToken = session.getRefreshToken();
            currentUser.refreshSession(refreshToken, (err) => {
                if (err == null)
                    return;
                currentUser.signOut();
            });
        });
    }
}
exports.SessionClient = SessionClient;

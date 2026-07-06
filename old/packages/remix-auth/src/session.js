"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSession = getSession;
const jwks_rsa_1 = __importDefault(require("jwks-rsa"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const cognito_client_1 = require("@saws/cognito/cognito-client");
const parameterized_env_var_name_1 = require("@saws/utils/parameterized-env-var-name");
async function getSession(name, request) {
    const client = (0, jwks_rsa_1.default)({
        jwksUri: String(process.env[(0, parameterized_env_var_name_1.parameterizedEnvVarName)(name, "USER_POOL_JWKS_URI")]),
    });
    const getJwksKey = (header, callback) => {
        client.getSigningKey(header.kid, (_, key) => {
            callback(null, key?.getPublicKey());
        });
    };
    const verifyToken = (accessToken) => {
        return new Promise((resolve, reject) => {
            jsonwebtoken_1.default.verify(accessToken, getJwksKey, {}, (err, decoded) => {
                if (err)
                    return reject(err);
                resolve(decoded);
            });
        });
    };
    const cookieString = request.headers.get("Cookie");
    if (cookieString == null) {
        return;
    }
    const cookies = cookieString.split(/;\s?/g);
    const authCookie = cookies.find((cookie) => cookie.match(/CognitoIdentityServiceProvider\..*\.accessToken/g));
    if (authCookie == null)
        return;
    const accessToken = authCookie.split("=")[1];
    try {
        const response = (await verifyToken(accessToken));
        return response;
    }
    catch (err) {
        // the user may be coming back to the site after being away a while and thus their token has expired on the first
        // try of loading the app
        if (err instanceof Error && err.name === "TokenExpiredError") {
            const refreshCookie = cookies.find((cookie) => cookie.match(/CognitoIdentityServiceProvider\..*\.refreshToken/g));
            if (refreshCookie == null)
                return;
            const refreshToken = refreshCookie.split("=")[1];
            if (refreshToken == null) {
                return;
            }
            try {
                const auth = new cognito_client_1.CognitoClient(name);
                const newAccessToken = await auth.refreshAccessToken(refreshToken);
                if (newAccessToken == null) {
                    return;
                }
                const response = (await verifyToken(newAccessToken));
                return response;
            }
            catch (err) {
                console.log("Failed to attempt refresh token validation", err);
                return;
            }
        }
        console.log("Failed to validate access token", err);
        return;
    }
}

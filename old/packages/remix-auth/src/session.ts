import jwksClient from "jwks-rsa";
import jwt, { GetPublicKeyOrSecret, JwtPayload } from "jsonwebtoken";
import { CognitoClient } from "@saws/cognito/cognito-client";
import { parameterizedEnvVarName } from "@saws/utils/parameterized-env-var-name";

export async function getSession(
  name: string,
  request: Request,
) {
  const client = jwksClient({
    jwksUri: String(process.env[parameterizedEnvVarName(name, "USER_POOL_JWKS_URI")]),
  });
  const getJwksKey: GetPublicKeyOrSecret = (header, callback) => {
    client.getSigningKey(header.kid, (_, key) => {
      callback(null, key?.getPublicKey());
    });
  };

  const verifyToken = (accessToken: string) => {
    return new Promise((resolve, reject) => {
      jwt.verify(accessToken, getJwksKey, {}, (err, decoded) => {
        if (err) return reject(err);
        resolve(decoded as JwtPayload);
      });
    });
  };

  const cookieString = request.headers.get("Cookie");
  if (cookieString == null) {
    return;
  }
  const cookies = cookieString.split(/;\s?/g);
  const authCookie = cookies.find((cookie) =>
    cookie.match(/CognitoIdentityServiceProvider\..*\.accessToken/g)
  );
  if (authCookie == null) return;

  const accessToken = authCookie.split("=")[1];

  try {
    const response = (await verifyToken(accessToken)) as JwtPayload;
    return response;
  } catch (err) {
    // the user may be coming back to the site after being away a while and thus their token has expired on the first
    // try of loading the app
    if (err instanceof Error && err.name === "TokenExpiredError") {
      const refreshCookie = cookies.find((cookie) =>
        cookie.match(/CognitoIdentityServiceProvider\..*\.refreshToken/g)
      );
      if (refreshCookie == null) return;

      const refreshToken = refreshCookie.split("=")[1];
      if (refreshToken == null) {
        return;
      }
      try {
        const auth = new CognitoClient(name)
        const newAccessToken = await auth.refreshAccessToken(refreshToken);
        if (newAccessToken == null) {
          return;
        }
        const response = (await verifyToken(newAccessToken)) as JwtPayload;
        return response;
      } catch (err) {
        console.log("Failed to attempt refresh token validation", err);
        return;
      }
    }
    console.log("Failed to validate access token", err);
    return;
  }
}

import {
  confirmUserSignUp,
  createUserPool,
  createUserPoolClient,
  getUser,
  initiateAuth,
  listUserPoolClients,
  listUserPools,
  signUpUser,
} from "../aws/cognito";
import { getCognitoParameters } from "./cognito-parameters";

export const seedCognito = async (stage: string) => {
  const cognitoParams = await getCognitoParameters(stage);

  const userPools = await listUserPools();
  let userPool = userPools.UserPools?.find(
    (pool) => pool.Name === cognitoParams.poolName
  );
  if (userPool == null) {
    const results = await createUserPool(cognitoParams.poolName);
    userPool = results.UserPool;
  }

  const userPoolClients = await listUserPoolClients(userPool?.Id ?? "");
  let userPoolClient = userPoolClients.UserPoolClients?.find(
    (client) => client.ClientName === cognitoParams.clientName
  );
  if (userPoolClient == null) {
    const results = await createUserPoolClient(
      cognitoParams.clientName,
      userPool?.Id ?? ""
    );
    userPoolClient = results.UserPoolClient;
  }

  let userConfirmed = false;
  try {
    const results = await getUser(
      userPool?.Id ?? "",
      cognitoParams.devUserEmail
    );
    userConfirmed = results.UserStatus !== "UNCONFIRMED";
  } catch (err: any) {
    if (err.code !== "CognitoLocal#UserNotFoundException") {
      throw err;
    }
    const results = await signUpUser(
      userPoolClient?.ClientId ?? "",
      cognitoParams.devUserEmail,
      cognitoParams.devUserPassword
    );
    userConfirmed = Boolean(results.UserConfirmed);
  }

  if (!userConfirmed) {
    await confirmUserSignUp(userPool?.Id ?? "", cognitoParams.devUserEmail);
  }

  const authResults = await initiateAuth(
    userPool?.Id ?? '',
    userPoolClient?.ClientId ?? '',
    cognitoParams.devUserEmail,
    cognitoParams.devUserPassword,
  );

  return {
    userPool,
    userPoolClient,
    devUserEmail: cognitoParams.devUserEmail,
    devUserPassword: cognitoParams.devUserPassword,
    accessToken: authResults.AuthenticationResult?.AccessToken,
    idToken: authResults.AuthenticationResult?.IdToken,
    refreshToken: authResults.AuthenticationResult?.RefreshToken,
  };
};

import { getSecretsManagerForStage } from "../secrets";
import {
  DEV_USER_PASSWORD_PARAMETER_NAME,
} from "./constants";
import { generateToken } from "./generate-token";
import { getProjectName } from "./get-project-name";

export const getCognitoParameters = async (
  stage: string = process.env.STAGE as string
) => {
  const password = await getDevUserPassword(stage);

  const projectName = getProjectName();
  return {
    poolName: `${projectName}-${stage}-users`,
    clientName: `${projectName}-${stage}-users-client`,
    devUserEmail: `dev@${projectName}.com`,
    devUserPassword: password,
  };
};

// This should not be used in any other stage other than local
export const getDevUserPassword = async (
  stage: string = process.env.STAGE as string
) => {
  if (stage !== 'local') {
    throw new Error('Stage can only be local to generate a dev user');
  }
  const secretsManager = getSecretsManagerForStage(stage);
  try {
    const password = await secretsManager.get(DEV_USER_PASSWORD_PARAMETER_NAME);
    return password;
  } catch (err) {
    if ((err as Error).name !== "ParameterNotFound") throw err;

    const newPassword = await generateToken();
    await secretsManager.set(DEV_USER_PASSWORD_PARAMETER_NAME, newPassword);
    return newPassword;
  }
};

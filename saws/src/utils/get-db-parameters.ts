import { getProjectName } from "./get-project-name";
import { getSecretsManagerForStage } from "../secrets";
import { DB_PASSWORD_PARAMETER_NAME } from "./constants";
import { generateToken } from "./generate-token";

export const getDBParameters = async (
  stage: string = process.env.STAGE as string
) => {
  return {
    username: getDBUsername(stage),
    name: getDBName(stage),
    password: await getDBPassword(stage),
  };
};

export const getDBPassword = async (
  stage: string = process.env.STAGE as string
) => {
  const secretsManager = getSecretsManagerForStage(stage);
  try {
    const password = await secretsManager.get(DB_PASSWORD_PARAMETER_NAME);
    return password;
  } catch (err) {
    if ((err as Error).name !== "ParameterNotFound") throw err;

    const newPassword = await generateToken();
    await secretsManager.set(DB_PASSWORD_PARAMETER_NAME, newPassword);
    return newPassword;
  }
};

export const getDBUsername = (stage: string = process.env.STAGE as string) => {
  const projectName = getProjectName();
  return `${projectName.replace(/[^a-zA-Z\d]/g, "_")}_${stage}`;
};

export const getDBName = (stage: string = process.env.STAGE as string) => {
  const projectName = getProjectName();
  return `${projectName.replace(/[^a-zA-Z\d]/g, "_")}_${stage}`;
};

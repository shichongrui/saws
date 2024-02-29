import { SecretsManager } from "@saws/secrets/secrets-manager";
import { generateToken } from "@saws/utils/generate-token";

export const getDBPasswordParameterName = (name: string, stage: string) =>
  `${stage}-${name}-postgress-user-password`;

export const getDBParameters = async (
  name: string,
  stage: string = process.env.STAGE as string
) => {
  return {
    username: getDBUsername(name, stage),
    name: getDBName(name, stage),
    password: await getDBPassword(name, stage),
    port: 5432,
    endpoint: "localhost",
  };
};

export const getDBPassword = async (
  name: string,
  stage: string = process.env.STAGE as string
) => {
  const secretsManager = new SecretsManager(stage);
  try {
    const password = await secretsManager.get(
      getDBPasswordParameterName(name, stage)
    );
    return password;
  } catch (err) {
    if ((err as Error).name !== "ParameterNotFound") throw err;

    const newPassword = await generateToken();
    await secretsManager.set(
      getDBPasswordParameterName(name, stage),
      newPassword
    );
    return newPassword;
  }
};

export const getDBUsername = (
  name: string,
  stage: string = process.env.STAGE as string
) => {
  return `${name.replace(/[^a-zA-Z\d]/g, "_")}_${stage}`;
};

export const getDBName = (
  name: string,
  stage: string = process.env.STAGE as string
) => {
  return `${name.replace(/[^a-zA-Z\d]/g, "_")}_${stage}`;
};

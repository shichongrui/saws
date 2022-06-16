import { Secrets } from "../..";
import { getParameter, putParameter } from "../aws/ssm";
import { DB_PASSWORD_PARAMETER_NAME } from "./constants";
import { generateToken } from "./generate-token";

export const getDBPassword = async () => {
  try {
    const password = await Secrets.get(DB_PASSWORD_PARAMETER_NAME);
    return password;
  } catch (err) {
    if ((err as Error).name !== "ParameterNotFound") throw err;

    const newPassword = await generateToken();
    await Secrets.set(DB_PASSWORD_PARAMETER_NAME, newPassword);
    return newPassword;
  }
};

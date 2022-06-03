import { getParameter, putParameter } from "../aws/ssm";
import crypto from "crypto";
import { generateToken } from "./generate-token";

export const getDBPassword = async () => {
  try {
    const password = await getParameter("/prod/db-password", true);
    return password;
  } catch (err) {
    if ((err as Error).name !== "ParameterNotFound") throw err;

    const newPassword = await generateToken();
    await putParameter("/prod/db-password", newPassword, true);
    return newPassword;
  }
};

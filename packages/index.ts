import { SESEmail } from "./email";
import FunctionsClient from "./functions/FunctionsClient";
import SecretsManager from "./secrets";
import { Auth as AuthClient } from "./auth/Auth";
import { Translate as TranslateClient } from "./translate";

export const Secrets = new SecretsManager(process.env.STAGE!);

export const Email = new SESEmail();
export const Translate = new TranslateClient();

export const Auth = new AuthClient();

export { default as RDS } from "./rds";
export * from "./api";
export * from "./remix";

export * from "./config";

export const Functions = new FunctionsClient(process.env.STAGE!);

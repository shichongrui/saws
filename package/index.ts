import { SESEmail } from "./email";
import FunctionsClient from "./functions/FunctionsClient";
import SecretsManager from "./secrets";

export const Secrets = new SecretsManager(process.env.STAGE!);

export const Email = new SESEmail();

export { default as RDS } from "./rds";
export * from "./api";

export * from './config';

export const Functions = new FunctionsClient(process.env.STAGE!);
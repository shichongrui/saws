import FunctionsClient from "./functions/FunctionsClient";
import SecretsManager from "./secrets";

export const Secrets = new SecretsManager(process.env.STAGE!);

export { default as RDS } from "./rds";
export { default as API } from "./api";
export * from "./api";

export * from './config';

export const Functions = new FunctionsClient(process.env.STAGE!);
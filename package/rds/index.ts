import SecretsManager from "../secrets";
import { DB_PASSWORD_PARAMETER_NAME } from "../utils/constants";

const {
  DATABASE_USERNAME,
  DATABASE_HOST,
  DATABASE_PORT,
  DATABASE_NAME,
  STAGE
} = process.env;

const secretsManager = new SecretsManager(STAGE!);

export default {
  async getDBUrl() {
    const dbPassword = await secretsManager.get(DB_PASSWORD_PARAMETER_NAME);
    return `postgres://${DATABASE_USERNAME}:${dbPassword}@${DATABASE_HOST}:${DATABASE_PORT}/${DATABASE_NAME}`;
  }
}

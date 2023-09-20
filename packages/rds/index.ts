import SecretsManager from "../secrets";
import { DB_PASSWORD_PARAMETER_NAME } from "../utils/constants";

const secretsManager = new SecretsManager(process.env.STAGE ?? 'local');

export default {
  async getDBUrl() {
    const {
      DATABASE_USERNAME,
      DATABASE_HOST,
      DATABASE_PORT,
      DATABASE_NAME,
    } = process.env;
    const dbPassword = await secretsManager.get(DB_PASSWORD_PARAMETER_NAME);
    return `postgres://${DATABASE_USERNAME}:${dbPassword}@${DATABASE_HOST}:${DATABASE_PORT}/${DATABASE_NAME}?connection_limit=1`;
  }
}

import SecretsManager from "../secrets";
import { DB_PASSWORD_PARAMETER_NAME } from "../utils/constants";
import { PrismaClient } from '@prisma/client';

const {
  DATABASE_USERNAME,
  DATABASE_HOST,
  DATABASE_PORT,
  DATABASE_NAME,
  STAGE
} = process.env;

const secretsManager = new SecretsManager(STAGE!);
let db: PrismaClient | null = null;

export default {
  async getDBClient() {
    const dbPassword = await secretsManager.get(DB_PASSWORD_PARAMETER_NAME);
    
    if (db == null) {
      db = new PrismaClient({
        datasources: {
          db: {
            url: `postgres://${DATABASE_USERNAME}:${dbPassword}@${DATABASE_HOST}:${DATABASE_PORT}/${DATABASE_NAME}`,
          },
        },
      });
    }    

    return db;
  }
}

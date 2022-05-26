import { PrismaClient } from "@prisma/client";
import { parameterizedEnvVarName } from "@saws/utils/parameterized-env-var-name";

export const getPrismaClient = (name: string): PrismaClient => {
  const {
    [parameterizedEnvVarName(name, "POSTGRES_USERNAME")]: username,
    [parameterizedEnvVarName(name, "POSTGRES_HOST")]: host,
    [parameterizedEnvVarName(name, "POSTGRES_PORT")]: port,
    [parameterizedEnvVarName(name, "POSTGRES_DB_NAME")]: dbName,
    [parameterizedEnvVarName(name, "POSTGRES_PASSWORD")]: password,
  } = process.env;

  const DATABASE_URL = `postgres://${username}:${password}@${host}:${port}/${dbName}?connection_limit=1`;

  return new PrismaClient({
    datasources: {
      db: {
        url: DATABASE_URL,
      },
    },
  });
};

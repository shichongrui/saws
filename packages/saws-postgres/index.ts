import { uppercase } from "@shichongrui/saws-core";
import { PrismaClient } from "@prisma/client";

const parameterizedName = (name: string, variable: string) =>
  `${uppercase(name.replace(/[^a-zA-Z\d]/g, "_"))}_${name}`;

export const getPrismaClient = (name: string) => {
  const {
    [parameterizedName(name, "POSTGRES_USERNAME")]: username,
    [parameterizedName(name, "POSTGRES_HOST")]: host,
    [parameterizedName(name, "POSTGRES_PORT")]: port,
    [parameterizedName(name, "POSTGRES_NAME")]: dbName,
    [parameterizedName(name, "POSTGRES_PASSWORD")]: password,
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

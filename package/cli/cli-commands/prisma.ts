import { exec } from "child_process";
import path from "path";

type DBParameters = {
  username: string;
  password: string;
  endpoint: string;
  port: string;
  dbName: string;
};

export const generatePrismaClient = () => {
  return new Promise(async (resolve, reject) => {
    const pathToSchema = path.resolve("./prisma/schema.prisma");

    exec(
      `./node_modules/.bin/prisma generate --schema=${pathToSchema}`,
      {
        cwd: path.resolve("./node_modules/saws"),
      },
      async (err) => {
        if (err != null) {
          reject(err);
          return;
        }
        
        resolve(null);
      }
    );
  });
};

export const prismaMigrate = ({
  username,
  password,
  endpoint,
  port,
  dbName,
}: DBParameters) => {
  return new Promise((resolve, reject) => {
    exec(
      "npx prisma migrate deploy",
      {
        env: {
          ...process.env,
          DATABASE_URL: `postgres://${username}:${password}@${endpoint}:${port}/${dbName}`,
        },
      },
      (err) => {
        if (err != null) {
          reject(err);
          return;
        }

        resolve(null);
      }
    );
  });
};

export const startPrismaStudio = ({
  username,
  password,
  endpoint,
  port,
  dbName,
  openBrowser = false,
}: DBParameters & { openBrowser?: boolean }) => {
  return new Promise((resolve, reject) => {
    exec(
      "npx prisma studio" + (!openBrowser ? " --browser none" : ""),
      {
        env: {
          ...process.env,
          DATABASE_URL: `postgres://${username}:${password}@${endpoint}:${port}/${dbName}`,
        },
      },
      (err) => {
        if (err != null) {
          reject(err);
          return;
        }
        resolve(null);
      }
    );
  });
};

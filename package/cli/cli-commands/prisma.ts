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
    exec(`npx prisma generate`, async (err) => {
      if (err != null) {
        reject(err);
        return;
      }

      resolve(null);
    });
  });
};

export const runMigrationsLocally = ({
  username,
  password,
  endpoint,
  port,
  dbName,
}: DBParameters) => {
  return new Promise(async (resolve, reject) => {
    exec(
      "npx prisma migrate dev",
      {
        env: {
          ...process.env,
          DATABASE_URL: `postgres://${username}:${password}@${endpoint}:${port}/${dbName}`,
        },
      },
      (err) => {
        if (err != null) {
          return reject(err);
        }

        resolve(null);
      }
    );
  });
};

export const createPrismaMigration = ({
  name,
  username,
  password,
  endpoint,
  port,
  dbName,
}: DBParameters & { name: string }) => {
  return new Promise((resolve, reject) => {
    console.log("Creating migration", name);
    exec(
      `npx prisma migrate dev --name ${name}`,
      {
        env: {
          ...process.env,
          DATABASE_URL: `postgres://${username}:${password}@${endpoint}:${port}/${dbName}`,
        },
      },
      (err) => {
        if (err != null) {
          return reject(err);
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

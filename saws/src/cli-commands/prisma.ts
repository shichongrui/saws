import { exec } from "child_process";
import path from 'path';
import { promises as fs } from 'fs';
import { CACHE_DIR } from "../utils/constants";

type DBParameters = {
  username: string;
  password: string;
  endpoint: string;
  port: string;
  dbName: string;
}

export const generatePrismaClient = () => {
  return new Promise(async (resolve, reject) => {
    const pathToSchema = path.resolve('./prisma/schema.prisma');
    const newPathToSchema = path.join(path.resolve('./node_modules/saws'), 'schema.prisma')
    await fs.cp(pathToSchema, newPathToSchema);

    exec(
      `./node_modules/.bin/prisma generate --schema=${newPathToSchema}`,
      {
        cwd: path.resolve('./node_modules/saws'),
      },
      async (err) => {
        if (err != null) {
          reject(err);
          return;
        }
        await fs.rm(newPathToSchema);
        resolve(null);
      }
    );
  });
};


export const deployPrismaMigrate = ({
  username,
  password,
  endpoint,
  port,
  dbName,
}: DBParameters) => {
  return new Promise((resolve, reject) => {
    exec(
      'npx prisma migrate deploy',
      {
        env: {
          ...process.env,
          DATABASE_URL: `postgres://${username}:${password}@${endpoint}:${port}/${dbName}`,
        }
      },
      (err) => {
        if (err != null) {
          reject(err);
          return;
        }

        resolve(null);
      }
    )
  })
}

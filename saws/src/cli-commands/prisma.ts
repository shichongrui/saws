import { exec } from "child_process";

type DBParameters = {
  username: string;
  password: string;
  endpoint: string;
  port: string;
  dbName: string;
}

export const generatePrismaClient = () => {
  return new Promise((resolve, reject) => {
    exec(
      "node_modules/saws/node_modules/.bin/prisma generate",
      (err, stdout, stderr) => {
        console.log(err, stdout, stderr);
        if (err != null) {

          reject(err);
          return;
        }

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

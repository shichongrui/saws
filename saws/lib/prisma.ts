import path from "path";
import { exec } from "child_process";

export const generatePrismaClient = () => {
  return new Promise((resolve, reject) => {
    exec(
      "DATABASE_URL=postgresql://postgres:password@localhost:5432/postgres npx prisma generate",
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

export const migratePrismaDev = () => {
  return new Promise((resolve, reject) => {
    exec(
      "DATABASE_URL=postgresql://postgres:password@localhost:5432/postgres npx prisma generate",
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

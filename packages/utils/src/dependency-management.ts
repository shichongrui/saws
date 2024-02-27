import { exec } from "child_process";
import fs from "node:fs";
import path from "node:path";

export const npmInstall = (dependency?: string, cwd: string = ".") => {
  return new Promise((resolve, reject) => {
    exec(
      `npm install --prefix ${cwd} ${dependency}`,
      {
        cwd,
      },
      (err, res) => {
        if (err != null) {
          return reject(err);
        }

        resolve(null);
      }
    );
  });
};

export const yarnInstall = (dependency?: string, cwd: string = ".") => {
  return new Promise((resolve, reject) => {
    exec(
      `yarn install ${dependency}`,
      {
        cwd,
      },
      (err) => {
        if (err != null) return reject(err);
        resolve(null);
      }
    );
  });
};

export const pnpmInstall = (dependency?: string, cwd: string = ".") => {
  return new Promise((resolve, reject) => {
    exec(
      `pnpm install ${dependency}`,
      {
        cwd,
      },
      (err) => {
        if (err != null) return reject(err);
        resolve(null);
      }
    );
  });
};

export const determinePackageManager = () => {
  if (fs.existsSync(path.resolve('./pnpm-lock.yaml'))) return 'pnpm'
  if (fs.existsSync(path.resolve('./yarn-lock.json'))) return 'yarn'
  return 'npm'
};

export const installDependency = (dependency: string) => {
  const packageManager = determinePackageManager()

  switch (packageManager) {
    case 'npm':
      return npmInstall(dependency)
    case 'yarn':
      return yarnInstall(dependency)
    case 'pnpm':
      return pnpmInstall(dependency)
  }
};

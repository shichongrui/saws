import { exec } from "child_process";
import fs from "node:fs";
import path from "node:path";
import findPackageJson from 'find-package-json'

type Options = {
  cwd?: string
  development?: boolean
}

export const npmInstall = (cwd?: string) => {
  return new Promise((resolve, reject) => {
    exec(
      `npm install`,
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
}

export const npmInstallDependency = (dependency: string, options: Options) => {
  return new Promise((resolve, reject) => {
    const prefix = options.cwd ? `--prefix ${options.cwd}` : ''
    const development = options.development ? '-D' : ''
    exec(
      `npm install ${development} ${dependency} ${prefix}`,
      {
        cwd: options.cwd,
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

export const yarnInstallDependency = (dependency: string, options: Options) => {
  return new Promise((resolve, reject) => {
    const development = options.development ? '-D' : ''
    exec(
      `yarn install ${development} ${dependency}`,
      {
        cwd: options.cwd,
      },
      (err) => {
        if (err != null) return reject(err);
        resolve(null);
      }
    );
  });
};

export const pnpmInstallDependency = (dependency: string, options: Options) => {
  return new Promise((resolve, reject) => {
    const development = options.development ? '-D' : ''
    exec(
      `pnpm install ${development} ${dependency}`,
      {
        cwd: options.cwd,
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

export const installDependency = (dependency: string, options: Options = {}) => {
  const packageManager = determinePackageManager()

  switch (packageManager) {
    case 'npm':
      return npmInstallDependency(dependency, options)
    case 'yarn':
      return yarnInstallDependency(dependency, options)
    case 'pnpm':
      return pnpmInstallDependency(dependency, options)
  }
};

export const installMissingDependencies = async (dependencies: string[], options: Options = {}) => {
  const packageJson = findPackageJson().next().value
  const missingDependencies = dependencies.filter(
    (d) => options.development ? packageJson?.devDependencies?.[d] == null : packageJson?.dependencies?.[d] == null
  );
  if (missingDependencies.length > 0) {
    console.log('Installing missing dependencies', missingDependencies.join(' '))
    await installDependency(missingDependencies.join(" "), options);
  }
}

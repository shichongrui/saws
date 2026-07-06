import { spawn } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import path from "node:path";

type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

export interface InstallDependenciesOptions {
  /**
   * The package or workspace root. Defaults to the current working directory.
   */
  cwd?: string;
  /**
   * A workspace directory, relative to `cwd`.
   */
  workspace?: string;
  development?: boolean;
}

export async function installDependencies(
  dependencies: string[],
  options: InstallDependenciesOptions = {},
): Promise<void> {
  if (dependencies.length === 0) return;

  const rootDirectory = path.resolve(options.cwd ?? process.cwd());
  const installDirectory =
    options.workspace == null ? rootDirectory : path.resolve(rootDirectory, options.workspace);
  const packageManager = await detectPackageManager(installDirectory);
  const args = installArguments(packageManager, dependencies, options.development ?? false);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(packageManager, args, {
      cwd: installDirectory,
      env: process.env,
      stdio: "inherit",
    });

    child.once("error", (error) => {
      reject(new Error(`Unable to run ${packageManager}: ${error.message}`, { cause: error }));
    });

    child.once("close", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      const reason = signal == null ? `exit code ${code ?? "unknown"}` : `signal ${signal}`;
      reject(new Error(`${packageManager} failed to install dependencies with ${reason}`));
    });
  });
}

async function detectPackageManager(cwd: string): Promise<PackageManager> {
  for (let directory = cwd; ; directory = path.dirname(directory)) {
    const packageManager = await readPackageManagerField(directory);
    if (packageManager != null) return packageManager;

    for (const [lockfile, manager] of LOCKFILES) {
      if (await exists(path.join(directory, lockfile))) return manager;
    }

    const parent = path.dirname(directory);
    if (parent === directory) return "npm";
  }
}

async function readPackageManagerField(directory: string): Promise<PackageManager | undefined> {
  try {
    const contents = await readFile(path.join(directory, "package.json"), "utf8");
    const packageJson = JSON.parse(contents) as { packageManager?: unknown };
    if (typeof packageJson.packageManager !== "string") return undefined;

    const name = packageJson.packageManager.split("@", 1)[0];
    return isPackageManager(name) ? name : undefined;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function installArguments(
  packageManager: PackageManager,
  dependencies: string[],
  development: boolean,
): string[] {
  switch (packageManager) {
    case "npm":
      return ["install", development ? "--save-dev" : "--save-prod", ...dependencies];
    case "pnpm":
    case "yarn":
    case "bun":
      return ["add", ...(development ? ["--dev"] : []), ...dependencies];
  }
}

function isPackageManager(value: string): value is PackageManager {
  return value === "npm" || value === "pnpm" || value === "yarn" || value === "bun";
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

const LOCKFILES: ReadonlyArray<readonly [string, PackageManager]> = [
  ["pnpm-lock.yaml", "pnpm"],
  ["yarn.lock", "yarn"],
  ["bun.lock", "bun"],
  ["bun.lockb", "bun"],
  ["package-lock.json", "npm"],
  ["npm-shrinkwrap.json", "npm"],
];

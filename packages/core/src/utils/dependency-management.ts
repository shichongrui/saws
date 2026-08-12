import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { RuntimeLogSink } from "../ServiceDefinition.js";
import { fileExists } from "./file-exists.js";

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
  logSink?: RuntimeLogSink;
  serviceName?: string;
}

export async function installDependencies(
  dependencies: string[],
  options: InstallDependenciesOptions = {},
): Promise<void> {
  if (dependencies.length === 0) return;

  const rootDirectory = path.resolve(options.cwd ?? process.cwd());
  const packageManager = await detectPackageManager(rootDirectory);
  const args = installArguments(
    packageManager,
    dependencies,
    options.development ?? false,
    options.workspace,
  );

  await new Promise<void>((resolve, reject) => {
    const captureOutput = options.logSink != null;
    const serviceName = options.serviceName ?? "system";
    const child = spawn(packageManager, args, {
      // Workspace-aware package managers must be run from the workspace root.
      // Running npm from within a workspace can install into the root package
      // instead of updating the generated service's package.json.
      cwd: rootDirectory,
      env: process.env,
      stdio: captureOutput ? ["ignore", "pipe", "pipe"] : "inherit",
    });

    child.stdout?.on("data", (chunk: Buffer) => {
      options.logSink?.({
        serviceName,
        stream: "stdout",
        chunk: chunk.toString("utf8"),
        timestamp: new Date(),
      });
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      options.logSink?.({
        serviceName,
        stream: "stderr",
        chunk: chunk.toString("utf8"),
        timestamp: new Date(),
      });
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

export async function hasDependency(dependency: string, cwd = process.cwd()) {
  try {
    const contents = await readFile(path.resolve(cwd, "package.json"), "utf8");
    const packageJson = JSON.parse(contents) as {
      dependencies?: Record<string, unknown>;
      devDependencies?: Record<string, unknown>;
    };

    return (
      packageJson.dependencies?.[dependency] != null ||
      packageJson.devDependencies?.[dependency] != null
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function detectPackageManager(cwd: string): Promise<PackageManager> {
  for (let directory = cwd; ; directory = path.dirname(directory)) {
    const packageManager = await readPackageManagerField(directory);
    if (packageManager != null) return packageManager;

    for (const [lockfile, manager] of LOCKFILES) {
      if (await fileExists(path.join(directory, lockfile))) return manager;
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
  workspace?: string,
): string[] {
  switch (packageManager) {
    case "npm":
      return [
        "install",
        ...(workspace == null ? [] : ["--workspace", workspace]),
        development ? "--save-dev" : "--save-prod",
        ...dependencies,
      ];
    case "pnpm":
      return [
        ...(workspace == null ? [] : ["--filter", workspace]),
        "add",
        ...(development ? ["--dev"] : []),
        ...dependencies,
      ];
    case "yarn":
      return workspace == null
        ? ["add", ...(development ? ["--dev"] : []), ...dependencies]
        : ["workspace", workspace, "add", ...(development ? ["--dev"] : []), ...dependencies];
    case "bun":
      return [
        "add",
        ...(workspace == null ? [] : ["--filter", workspace]),
        ...(development ? ["--dev"] : []),
        ...dependencies,
      ];
  }
}

function isPackageManager(value: string): value is PackageManager {
  return value === "npm" || value === "pnpm" || value === "yarn" || value === "bun";
}

const LOCKFILES: ReadonlyArray<readonly [string, PackageManager]> = [
  ["pnpm-lock.yaml", "pnpm"],
  ["yarn.lock", "yarn"],
  ["bun.lock", "bun"],
  ["bun.lockb", "bun"],
  ["package-lock.json", "npm"],
  ["npm-shrinkwrap.json", "npm"],
];

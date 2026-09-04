import fs from "node:fs/promises";
import path from "node:path";
import { valid } from "semver";

interface InstalledPackageJson {
  dependencies?: Record<string, string>;
  version?: string;
}

export async function getInstalledApplicationPackage(appDirectory: string, name: string) {
  let packageJson: InstalledPackageJson;
  try {
    packageJson = JSON.parse(
      await fs.readFile(path.join(appDirectory, "package.json"), "utf8"),
    ) as InstalledPackageJson;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Application "${name}" is not installed`);
    }
    throw new Error(`Could not read package metadata for application "${name}"`, { cause: error });
  }

  const dependencyNames = Object.keys(packageJson.dependencies ?? {});
  if (dependencyNames.length !== 1) {
    throw new Error(`Application "${name}" must have exactly one application package dependency`);
  }
  return dependencyNames[0]!;
}

export async function getInstalledVersion(appDirectory: string, packageName: string) {
  const packageJson = JSON.parse(
    await fs.readFile(path.join(appDirectory, "node_modules", packageName, "package.json"), "utf8"),
  ) as InstalledPackageJson;
  if (packageJson.version == null || valid(packageJson.version) == null) {
    throw new Error(`Installed ${packageName} does not have a valid semantic version`);
  }
  return packageJson.version;
}

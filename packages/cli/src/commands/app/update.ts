import fs from "node:fs/promises";
import path from "node:path";
import { gt, prerelease, valid } from "semver";
import { applicationWrapper, pathExists } from "./files.js";
import { getInstalledApplicationPackage, getInstalledVersion } from "./metadata.js";
import { getAppDirectory } from "./paths.js";
import { getProcessOutput, runProcess } from "./process.js";

export async function updateAppCommand(name: string) {
  const appDirectory = getAppDirectory(name);
  const packageName = await getInstalledApplicationPackage(appDirectory, name);
  const installedVersion = await getInstalledVersion(appDirectory, packageName);
  const migrated = await migrateLegacyConfig(appDirectory, packageName);
  const npmTag = prerelease(installedVersion)?.[0] === "beta" ? "beta" : "latest";
  const latestVersion = await getLatestVersion(appDirectory, packageName, npmTag);

  if (!gt(latestVersion, installedVersion)) {
    const status = gt(installedVersion, latestVersion)
      ? `is newer than npm ${npmTag}`
      : "is up to date";
    console.log(
      `Application "${name}" ${status} (${installedVersion})${migrated ? "; migrated input.ts to config.ts" : ""}`,
    );
    return;
  }

  await runProcess(
    "npm",
    ["install", "--save-exact", "--no-fund", "--no-audit", `${packageName}@${latestVersion}`],
    appDirectory,
  );
  await fs.writeFile(path.join(appDirectory, "saws.ts"), applicationWrapper(packageName));

  console.log(
    `Updated application "${name}" from ${installedVersion} to ${latestVersion}${migrated ? " and migrated input.ts to config.ts" : ""}`,
  );
}

async function getLatestVersion(appDirectory: string, packageName: string, npmTag: string) {
  const output = await getProcessOutput(
    "npm",
    ["view", `${packageName}@${npmTag}`, "version", "--json"],
    appDirectory,
  );
  const version = JSON.parse(output) as unknown;
  if (typeof version !== "string" || valid(version) == null) {
    throw new Error(`npm ${npmTag} for ${packageName} is not a valid semantic version`);
  }
  return version;
}

async function migrateLegacyConfig(appDirectory: string, packageName: string) {
  const inputPath = path.join(appDirectory, "input.ts");
  const configPath = path.join(appDirectory, "config.ts");
  const [hasInput, hasConfig] = await Promise.all([pathExists(inputPath), pathExists(configPath)]);

  if (hasInput && hasConfig) {
    throw new Error(
      `Application contains both input.ts and config.ts; remove one before updating so SAWS does not overwrite configuration`,
    );
  }
  if (!hasInput && !hasConfig) {
    throw new Error(`Application configuration is missing; expected config.ts or legacy input.ts`);
  }
  if (!hasInput) {
    return false;
  }

  const wrapperPath = path.join(appDirectory, "saws.ts");
  const pendingWrapperPath = path.join(appDirectory, ".saws.ts.update");
  await fs.writeFile(pendingWrapperPath, applicationWrapper(packageName), { flag: "wx" });
  try {
    await fs.rename(inputPath, configPath);
    await fs.rename(pendingWrapperPath, wrapperPath);
  } catch (error) {
    if (await pathExists(configPath)) {
      await fs.rename(configPath, inputPath).catch(() => undefined);
    }
    await fs.rm(pendingWrapperPath, { force: true });
    throw error;
  }
  return true;
}

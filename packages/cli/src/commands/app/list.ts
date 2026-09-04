import fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";
import { pathExists } from "./files.js";
import { getInstalledApplicationPackage, getInstalledVersion } from "./metadata.js";
import { getAppDirectory, getAppsDirectory } from "./paths.js";

interface ApplicationRow {
  name: string;
  packageName: string;
  version: string;
  config: string;
}

export async function listAppsCommand() {
  const names = await getApplicationNames();
  if (names.length === 0) {
    console.log("No applications installed");
    return;
  }

  const rows = await Promise.all(names.map(getApplicationRow));
  printTable(rows);
}

async function getApplicationNames() {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(getAppsDirectory(), { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

async function getApplicationRow(name: string): Promise<ApplicationRow> {
  const appDirectory = getAppDirectory(name);
  let packageName = "unknown";
  let version = "unknown";

  try {
    packageName = await getInstalledApplicationPackage(appDirectory, name);
    version = await getInstalledVersion(appDirectory, packageName);
  } catch {
    // Keep malformed or incomplete application directories visible in the list.
  }

  const [hasConfig, hasInput] = await Promise.all([
    pathExists(path.join(appDirectory, "config.ts")),
    pathExists(path.join(appDirectory, "input.ts")),
  ]);
  const config =
    hasConfig && hasInput
      ? "conflict"
      : hasConfig
        ? "config.ts"
        : hasInput
          ? "input.ts (legacy)"
          : "missing";

  return { name, packageName, version, config };
}

function printTable(rows: ApplicationRow[]) {
  const values = [
    ["NAME", "PACKAGE", "VERSION", "CONFIG"],
    ...rows.map((row) => [row.name, row.packageName, row.version, row.config]),
  ];
  const widths = values[0]!.map((_, column) =>
    Math.max(...values.map((row) => row[column]!.length)),
  );

  console.log(
    values
      .map((row) =>
        row
          .map((value, column) => value.padEnd(widths[column]!))
          .join("  ")
          .trimEnd(),
      )
      .join("\n"),
  );
}

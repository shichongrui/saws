import fs from "node:fs/promises";
import path from "node:path";
import { getAppDirectory } from "./paths.js";
import { runProcess } from "./process.js";

export interface InstallAppOptions {
  name: string;
  config: string;
}

export async function installAppCommand(packageSpecifier: string, options: InstallAppOptions) {
  const packageName = getPackageName(packageSpecifier);
  const appDirectory = getAppDirectory(options.name);
  const inputPath = path.resolve(options.config);
  const installedInputPath = path.join(appDirectory, "input.ts");

  await fs.mkdir(appDirectory, { recursive: true });
  if (inputPath !== installedInputPath) {
    await fs.copyFile(inputPath, installedInputPath);
  }
  await fs.writeFile(
    path.join(appDirectory, "package.json"),
    `${JSON.stringify(
      {
        name: "saws-installed-application",
        private: true,
        type: "module",
      },
      null,
      2,
    )}\n`,
  );
  await fs.writeFile(path.join(appDirectory, "saws.ts"), applicationWrapper(packageName));

  await runProcess(
    "npm",
    ["install", "--save-exact", "--no-fund", "--no-audit", packageSpecifier],
    appDirectory,
  );
  console.log(`Installed ${packageSpecifier} as application "${options.name}"`);
}

function getPackageName(specifier: string) {
  const trimmed = specifier.trim();
  const match = /^(?<name>@[^/\s]+\/[^@/\s]+|[^@/\s]+)(?:@[^\s]+)?$/.exec(trimmed);
  const name = match?.groups?.name;
  if (name == null) {
    throw new Error(
      "Application package must be an npm package name with an optional version or tag",
    );
  }
  return name;
}

function applicationWrapper(packageName: string) {
  return `import { createSawsConfig } from "@saws/core";
import input from "./input.ts";
import * as application from ${JSON.stringify(packageName)};

export * from "./input.ts";

export default await createSawsConfig(application, input);
`;
}

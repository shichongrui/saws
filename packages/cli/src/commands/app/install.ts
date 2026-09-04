import fs from "node:fs/promises";
import path from "node:path";
import { applicationConfig, applicationWrapper, getPackageName } from "./files.js";
import { getAppDirectory } from "./paths.js";
import { runProcess } from "./process.js";

export interface InstallAppOptions {
  name: string;
}

export async function installAppCommand(packageSpecifier: string, options: InstallAppOptions) {
  const packageName = getPackageName(packageSpecifier);
  const appDirectory = getAppDirectory(options.name);

  await fs.mkdir(path.dirname(appDirectory), { recursive: true });
  try {
    await fs.mkdir(appDirectory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(`Application "${options.name}" is already installed`);
    }
    throw error;
  }

  try {
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
    await fs.writeFile(path.join(appDirectory, "config.ts"), applicationConfig(packageName));
    await fs.writeFile(path.join(appDirectory, "saws.ts"), applicationWrapper(packageName));

    await runProcess(
      "npm",
      ["install", "--save-exact", "--no-fund", "--no-audit", packageSpecifier],
      appDirectory,
    );
  } catch (error) {
    await fs.rm(appDirectory, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }

  console.log(`Installed ${packageSpecifier} as application "${options.name}"`);
  console.log(`Configure it by editing ${path.join(appDirectory, "config.ts")}`);
}

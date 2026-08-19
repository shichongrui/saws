import fs from "node:fs/promises";
import path from "node:path";
import { getAppDirectory } from "./paths.js";
import { runSaws } from "./process.js";

export interface DeployAppOptions {
  stage: string;
}

export async function deployAppCommand(name: string, options: DeployAppOptions) {
  if (options.stage == null || options.stage.length === 0) {
    throw new Error("app deploy requires --stage <string>");
  }
  if (options.stage === "local") {
    throw new Error("Can not deploy an application to the local stage");
  }

  const appDirectory = getAppDirectory(name);
  try {
    await fs.access(path.join(appDirectory, "saws.ts"));
  } catch {
    throw new Error(`Application "${name}" is not installed`);
  }

  await runSaws(["deploy", "--stage", options.stage], appDirectory);
}

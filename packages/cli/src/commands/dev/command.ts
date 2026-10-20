import { createCacheDir } from "@saws/core/utils/create-directories";
import { getSawsConfig } from "@saws/core";
import { launchProcessCompose, writeProcessComposeConfig } from "./process-compose.js";

export const devCommand = async (
  path = "./saws.ts",
  options: { tui?: boolean; dryRun?: boolean } = {},
) => {
  process.env.NODE_ENV = "development";
  process.env.STAGE = "local";
  process.env.AWS_REGION = "us-west-2";

  await createCacheDir();
  const serviceDefinition = await getSawsConfig(path);
  const configPath = await writeProcessComposeConfig(serviceDefinition, path);
  if (options.dryRun) {
    console.log(configPath);
    return;
  }
  await launchProcessCompose(
    configPath,
    options.tui !== false && Boolean(process.stdout.isTTY && process.stdin.isTTY),
  );
};

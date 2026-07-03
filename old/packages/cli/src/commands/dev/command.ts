import { createCacheDir } from "@saws/utils/create-directories";
import { onProcessExit } from "@saws/utils/on-exit";
import { getSawsConfig } from "@saws/core";

export const devCommand = async (path: string) => {
  process.env.NODE_ENV = "development";
  process.env.STAGE = "local";
  process.env.AWS_REGION = 'us-west-2';

  await createCacheDir();

  const serviceDefinition = await getSawsConfig(path);

  onProcessExit(() => {
    serviceDefinition.exit();
  });

  await serviceDefinition.dev();

  serviceDefinition.forEachDependency(async (dependency) => {
    dependency.getStdOut()?.pipe(process.stdout)
  })
};

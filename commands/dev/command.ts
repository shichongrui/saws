import { createCacheDir } from "../../utils/create-directories";
import { onProcessExit } from "../../utils/on-exit";
import { getSawsConfig } from "../../utils/get-saws-config";

export const devCommand = async (path: string) => {
  process.env.NODE_ENV = "development";
  process.env.STAGE = "local";

  await createCacheDir();

  const serviceDefinition = await getSawsConfig(path);

  onProcessExit(() => {
    serviceDefinition.exit();
  });

  await serviceDefinition.dev();

  process.env = {
    ...process.env,
    ...(await serviceDefinition.getEnvironmentVariables('local')),
  };

  serviceDefinition.forEachDependency(async (dependency) => {
    dependency.getStdOut()?.pipe(process.stdout)
  })
};

import { createCacheDir } from "@shichongrui/saws-utils/create-directories";
import { getSawsConfig } from "@shichongrui/saws-core";

export const deployCommand = async (path: string, { stage }: { stage: string }) => {
  if (stage === "local") {
    console.warn("Can not deploy to local stage");
    process.exit();
  }

  await createCacheDir();

  const serviceDefinition = await getSawsConfig(path);

  await serviceDefinition.deploy(stage);
};

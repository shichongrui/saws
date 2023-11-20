import { createCacheDir } from "../../utils/create-directories";
import { onProcessExit } from "../../utils/on-exit";
import { getSawsConfig } from "../../utils/get-saws-config";

export const deployCommand = async (path: string, { stage }: { stage: string }) => {
  if (stage === "local") {
    console.warn("Can not deploy to local stage");
    process.exit();
  }

  await createCacheDir();

  const serviceDefinition = await getSawsConfig(path);

  await serviceDefinition.deploy(stage);
};

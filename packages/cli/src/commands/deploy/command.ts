// import { createCacheDir } from "@saws/utils/create-directories";
import { findServiceDefinition, getSawsConfig } from "@saws/core";

interface DeployOptions {
  stage: string;
  name?: string;
}

export const deployCommand = async (path: string, { stage, name }: DeployOptions) => {
  if (stage == null || stage.length === 0) {
    throw new Error("deploy requires --stage <string>");
  }
  if (stage === "local") {
    console.warn("Can not deploy to local stage");
    process.exit();
  }

  process.env.STAGE = stage;

  // await createCacheDir();

  const serviceDefinition = await getSawsConfig(path);
  const deploymentRoot =
    name == null ? serviceDefinition : findServiceDefinition(serviceDefinition, name);

  await deploymentRoot.deploy(stage);
};

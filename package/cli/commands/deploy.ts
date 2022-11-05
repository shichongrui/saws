import path from "path";
import { build } from "../build";
import { CloudFormation } from "../../aws/cloudformation";
import { S3 } from "../../aws/s3";
import { EC2 } from "../../aws/ec2";
import { createCacheDir, createSawsDir } from "../../utils/create-directories";
import { getBuildPathsForEntrypoint } from "../../utils/get-build-paths";
import sawsResourcesTemplate, {
  getStackName as getResourcesStackName,
} from "../templates/saws-resources.template";
import sawsApiTemplate, {
  getStackName as getApiStackName,
} from "../templates/saws-api.template";
import { BUILD_DIR, DB_PASSWORD_PARAMETER_NAME } from "../../utils/constants";
import { prismaMigrate } from "../cli-commands/prisma";
import { getProjectName } from "../../utils/get-project-name";
import { buildCodeZip } from "../../utils/build-code-zip";
import { getDBParameters } from "../../utils/get-db-parameters";
import { writeStageOutputs } from "../../utils/stage-outputs";
import { getSawsConfig } from "../../utils/get-saws-config";
// import getModuleConfig from "../../utils/get-module-config";
// import { ApiConfig, FunctionConfig, ModuleType } from "../../config";
// import getAwsAccountId from "../../utils/get-aws-account-id";
// import {
//   buildImage,
//   loginToAWSDocker,
//   pushImage,
//   tagImage,
// } from "../cli-commands/docker";
// import sawsFunctionTemplate, {
//   getFunctionStackName,
// } from "../templates/saws-function.template";
// import { npmInstall } from "../cli-commands/npm";
import { ModuleDefinition } from "../modules/ModuleDefinition";
import { getModuleFromConfig } from "../utils/get-module-from-config";

export async function deploy(stage: string) {
  if (stage === "local") {
    console.warn("Can not deploy to local stage");
    process.exit();
  }

  await createCacheDir();

  const sawsConfig = await getSawsConfig(".");

  // services
  const services: Record<string, ModuleDefinition> = {};
  for (const [name, config] of Object.entries(sawsConfig.services)) {
    const service = getModuleFromConfig(name, config, []);
    if (service == null) continue;

    services[name] = service;
    await service.deploy(stage);
    await writeStageOutputs(
      {
        [name]: service.getOutputs(),
      },
      stage
    );
  }

  // modules

  const copy = Object.entries(sawsConfig.modules).slice();
  const modules: Record<string, ModuleDefinition> = {};
  while (copy.length > 0) {
    const [name, config] = copy.shift()!;
    const numDependencies = config.uses?.length ?? 0;
    const dependencies =
      config.uses?.map(
        (dependency) => services[dependency] ?? modules[dependency]
      ) ?? [];
    if (dependencies.length !== numDependencies) {
      copy.push([name, config]);
      continue;
    }

    const module = getModuleFromConfig(name, config, dependencies);
    if (module != null) {
      modules[name] = module;
      await module.deploy(stage);
      await writeStageOutputs(
        {
          [name]: module.getOutputs(),
        },
        stage
      );
    }
  }
}

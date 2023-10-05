import { createCacheDir } from "../utils/create-directories";
import { writeStageOutputs } from "../utils/stage-outputs";
import { getSawsConfig } from "../utils/get-saws-config";
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

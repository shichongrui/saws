import { createCacheDir } from "../../utils/create-directories";
import { writeStageOutputs } from "../../utils/stage-outputs";
import { getSawsConfig } from "../../utils/get-saws-config";
import { ModuleDefinition } from "../modules/ModuleDefinition";
import { onProcessExit } from "../on-exit";
import { getModuleFromConfig } from "../utils/get-module-from-config";

export async function startDev() {
  process.env.NODE_ENV = 'dev'
  process.env.STAGE = 'local'

  await createCacheDir();

  const sawsConfig = await getSawsConfig(".");

  const services: Record<string, ModuleDefinition> = {};
  const modules: Record<string, ModuleDefinition> = {};

  onProcessExit(() => {
    for (const module of [
      ...Object.values(services),
      ...Object.values(modules),
    ]) {
      module.exit();
    }
  });

  // start up all services
  const serviceConfigs = Object.entries(sawsConfig.services);
  for (const [name, config] of serviceConfigs) {
    const service = getModuleFromConfig(name, config, []);
    if (service != null) {
      services[name] = service;
      await service.dev();
      await writeStageOutputs({
        [name]: service.getOutputs(),
      }, 'local');
      process.env = {
        ...process.env,
        ...service.getEnvironmentVariables()
      }
    }
  }

  const moduleConfigs = Object.entries(sawsConfig.modules);
  const copy = moduleConfigs.slice();
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
      await module.dev();
      await writeStageOutputs({
        [name]: module.getOutputs(),
      }, 'local');
      process.env = {
        ...process.env,
        ...module.getEnvironmentVariables()
      }
    }
  }

  for (const [name, module] of [
    ...Object.entries(services),
    ...Object.entries(modules),
  ]) {
    module.getStdOut()?.pipe(process.stdout)
  }
}

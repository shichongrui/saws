import { ModuleType, SawsConfig, ServiceType } from "@shichongrui/saws-core";
import { ModuleDefinition } from "../modules/ModuleDefinition";
import { getModuleFromConfig } from "./get-module-from-config";

export const getModulesOfType = (
  type: ModuleType | ServiceType,
  config: SawsConfig
) => {
  const services: Record<string, ModuleDefinition> = {};
  const modules: Record<string, ModuleDefinition> = {};

  const serviceConfigs = Object.entries(config.services);
  for (const [name, config] of serviceConfigs) {
    const service = getModuleFromConfig(name, config, []);
    if (service != null) {
      services[name] = service;
    }
  }

  const moduleConfigs = Object.entries(config.modules);
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
    }
  }

  return [...Object.values(services), ...Object.values(modules)].filter(
    (module) => module.type === type
  );
};

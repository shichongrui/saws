import { type ServiceDefinition } from "./ServiceDefinition.js";
import { resolve } from "path";

export type SawsCreate<TConfig = unknown> = (
  config: TConfig,
) => ServiceDefinition | Promise<ServiceDefinition>;

export type SawsConfigModule = {
  default: ServiceDefinition;
  create?: SawsCreate;
  [name: string]: unknown;
};

export type SawsCreateModule<TConfig = unknown> = {
  create: SawsCreate<TConfig>;
  [name: string]: unknown;
};

export async function getSawsConfigModule(path: string = "./saws.ts"): Promise<SawsConfigModule> {
  const pathToConfig = resolve(path);
  return (await import(pathToConfig)) as SawsConfigModule;
}

export async function getSawsConfig(path: string = "./saws.ts"): Promise<ServiceDefinition> {
  return (await getSawsConfigModule(path)).default;
}

export async function createSawsConfig<TConfig>(
  module: SawsCreateModule<TConfig>,
  config: TConfig,
): Promise<ServiceDefinition> {
  if (typeof module.create !== "function") {
    throw new Error('Packaged SAWS applications must export a factory function named "create"');
  }

  const serviceDefinition = await module.create(config);
  if (
    serviceDefinition == null ||
    typeof serviceDefinition !== "object" ||
    typeof serviceDefinition.deploy !== "function"
  ) {
    throw new Error('The SAWS application "create" function must return a ServiceDefinition');
  }

  return serviceDefinition;
}

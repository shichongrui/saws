import { type ServiceDefinition } from "./ServiceDefinition.js";
import { resolve } from "path";

export type SawsConfigModule = {
  default: ServiceDefinition;
  [name: string]: unknown;
};

export async function getSawsConfigModule(path: string = "./saws.ts"): Promise<SawsConfigModule> {
  const pathToConfig = resolve(path);
  return (await import(pathToConfig)) as SawsConfigModule;
}

export async function getSawsConfig(path: string = "./saws.ts"): Promise<ServiceDefinition> {
  return (await getSawsConfigModule(path)).default;
}

import { type ServiceDefinition } from "./ServiceDefinition";
import { resolve } from "path";

export async function getSawsConfig(path: string = './saws.js'): Promise<ServiceDefinition> {
  const pathToConfig = resolve(path);
  const serviceDefinition = await import(pathToConfig);
  return serviceDefinition.default as ServiceDefinition
}

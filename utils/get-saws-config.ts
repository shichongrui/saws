import { ServiceDefinition } from "../services/ServiceDefinition";
import { resolve } from "path";

export async function getSawsConfig(path: string): Promise<ServiceDefinition> {
  const pathToConfig = resolve(path);
  const serviceDefinition = await import(pathToConfig);
  return serviceDefinition.default as ServiceDefinition
}

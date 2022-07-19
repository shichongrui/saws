import { parse } from 'path';
import { SawsModuleConfig } from "../config";

export default async function getModuleConfig(path: string) {
  const configModule = await import(path);
  const config = configModule.default as SawsModuleConfig;
  config.rootDir = config.rootDir ?? parse(path).dir;
  return config;
}
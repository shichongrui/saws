import path from "path";
import { SawsConfig } from "../config";

// const ignore = /(node_modules|\.git|\.saws)/g;

export async function getSawsConfig(dir: string): Promise<SawsConfig> {
  const pathToConfig = path.resolve(dir, "saws-config.ts");
  const configModule = await import(pathToConfig);
  const config = configModule.config as SawsConfig;
  return config
}

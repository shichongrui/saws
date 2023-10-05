import { resolve } from "path";
import type { SawsConfig } from "@shichongrui/saws-core";

// const ignore = /(node_modules|\.git|\.saws)/g;

export async function getSawsConfig(dir: string): Promise<SawsConfig> {
  const pathToConfig = resolve(dir, "saws-config.js");
  const configModule = await import(pathToConfig);
  const config = configModule.config as SawsConfig;
  return config
}

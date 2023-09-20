import path from "path";
import { getSawsConfig } from "../../utils/get-saws-config";
import { getStageOutputs } from "../../utils/stage-outputs";
import { ModuleDefinition } from "../modules/ModuleDefinition";
import { getModuleFromConfig } from "../utils/get-module-from-config";
import esbuild from 'esbuild'
import { SAWS_DIR } from "../../utils/constants";

const pkg = require(path.resolve('.', 'package.json'))

export const execute = async (scriptPath: string, stage: string = 'local') => {
  process.env.STAGE = stage;
  process.env.NODE_ENV = stage === 'local' ? 'development' : 'production'

  const sawsConfig = await getSawsConfig(".");
  const outputs = await getStageOutputs(stage);

  const services: Record<string, ModuleDefinition> = {};
  const modules: Record<string, ModuleDefinition> = {};

  const serviceConfigs = Object.entries(sawsConfig.services);
  for (const [name, config] of serviceConfigs) {
    const service = getModuleFromConfig(name, config, []);
    if (service != null) {
      service.setOutputs(outputs[name])
      process.env = {
        ...process.env,
        ...(await service.getEnvironmentVariables())
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
      module.setOutputs(outputs[name])
      modules[name] = module;
      process.env = {
        ...process.env,
        ...(await module.getEnvironmentVariables())
      }
    }
  }

  const outfile = path.resolve(SAWS_DIR, 'scripts', 'script.js')
  await esbuild.build({
    entryPoints: [path.resolve('.', scriptPath)],
    bundle: true,
    outfile,
    sourcemap: true,
    platform: "node",
    external: [...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.peerDependencies || {})]
  });

  console.log('running', scriptPath)
  require(outfile)
}
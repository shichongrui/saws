import { FunctionRuntime, ModuleType, SawsModuleConfig } from "saws"

const config: SawsModuleConfig = {
  type: ModuleType.FUNCTION,
  name: 'test-container',
  runtime: FunctionRuntime.CONTAINER,
}

export default config;
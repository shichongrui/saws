export enum ModuleType {
  API = "api",
  FUNCTION = "function",
}

export enum FunctionRuntime {
  CONTAINER = "container",
}

export type FunctionConfig = {
  type: ModuleType.FUNCTION;
  name: string;
  runtime: FunctionRuntime;
  port?: number;
  rootDir?: string;
};

export type ApiConfig = {
  type: ModuleType.API;
  name: string;
  rootDir?: string;
};

export type SawsModuleConfig = FunctionConfig | ApiConfig;

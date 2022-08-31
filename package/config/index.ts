export enum ModuleType {
  API = "api",
  FUNCTION = "function",
}

export enum FunctionRuntime {
  CONTAINER = "container",
}

export type BaseConfig = {
  name: string;
  rootDir?: string;
  // uses: string[];
};

export type FunctionConfig = BaseConfig & {
  type: ModuleType.FUNCTION;
  runtime: FunctionRuntime;
  port?: number;
};

export type ApiConfig = BaseConfig & {
  type: ModuleType.API;
};

export type SawsModuleConfig = FunctionConfig | ApiConfig;

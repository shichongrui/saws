export enum ModuleType {
  API = "api",
  FUNCTION = "function",
}

export enum ServiceType {
  POSTGRES = "postgres",
  AUTH = "auth",
}

export enum FunctionRuntime {
  CONTAINER = "container",
}

export type BaseConfig = {
  displayName?: string;
};

export type PostgresConfig = BaseConfig & {
  type: ServiceType.POSTGRES;
};

export type AuthConfig = BaseConfig & {
  type: ServiceType.AUTH;
};

export type BaseModuleConfig = BaseConfig & {
  rootDir?: string;
  uses?: string[];
}

export type ContainerFunctionConfig = {
  runtime: FunctionRuntime.CONTAINER
  port?: number;
}

export type FunctionConfig = BaseModuleConfig & ContainerFunctionConfig & {
  type: ModuleType.FUNCTION;
};

export type ApiConfig = BaseModuleConfig & {
  type: ModuleType.API;
  port?: number;
};

export type ModuleConfig = FunctionConfig | ApiConfig;
export type ServiceConfig = PostgresConfig | AuthConfig;

export type SawsConfig = {
  services: Record<string, ServiceConfig>;
  modules: Record<string, ModuleConfig>;
};

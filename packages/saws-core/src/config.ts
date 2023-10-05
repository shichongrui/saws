export enum ModuleType {
  API = "api",
  FUNCTION = "function",
  WEBSITE = "website",
  CONTAINER = "container",
  REMIX = "remix",
}

export enum ServiceType {
  POSTGRES = "postgres",
  AUTH = "auth",
  TRANSLATE = "translate",
  FILE_STORAGE = "file_storage",
}

export enum FunctionRuntime {
  CONTAINER = "container",
  TYPESCRIPT = "typescript",
}

export type BaseConfig = {
  displayName?: string;
};

export type PostgresConfig = BaseConfig & {
  type: ServiceType.POSTGRES;
};

export type AuthConfig = BaseConfig & {
  type: ServiceType.AUTH;
  devUser?: {
    username: string;
    password: string;
  };
};

export type FileStorageConfig = BaseConfig & {
  type: ServiceType.FILE_STORAGE;
};

export type TranslateConfig = BaseConfig & {
  type: ServiceType.TRANSLATE;
};

export type BaseModuleConfig = BaseConfig & {
  rootDir?: string;
  uses?: string[];
};

export type ContainerFunctionConfig = BaseModuleConfig & {
  type: ModuleType.FUNCTION;
  runtime: FunctionRuntime.CONTAINER;
  port?: number;
  memory?: number;
};

export type TypescriptFunctionConfig = BaseModuleConfig & {
  type: ModuleType.FUNCTION;
  runtime: FunctionRuntime.TYPESCRIPT;
  externalPackages?: string[];
  triggers?: {
    cron?: string;
  };
};

export type FunctionConfig = ContainerFunctionConfig | TypescriptFunctionConfig;

export type ApiConfig = BaseModuleConfig & {
  type: ModuleType.API;
  port?: number;
  externalPackages?: string[];
};

export type WebsiteConfig = BaseModuleConfig & {
  type: ModuleType.WEBSITE;
  port?: number;
  domain?: string;
  certificateArn?: string;
  env?: Record<string, string>;
};

export type RemixConfig = BaseModuleConfig & {
  type: ModuleType.REMIX;
  port?: number;
};

export type ContainerConfig = BaseModuleConfig & {
  type: ModuleType.CONTAINER;
  port?: number;
  healthCheckUrl?: string;
};

export type ModuleConfig =
  | FunctionConfig
  | ApiConfig
  | WebsiteConfig
  | ContainerConfig
  | RemixConfig;

export type ServiceConfig =
  | PostgresConfig
  | AuthConfig
  | TranslateConfig
  | FileStorageConfig;

export type SawsConfig = {
  services: Record<string, ServiceConfig>;
  modules: Record<string, ModuleConfig>;
};

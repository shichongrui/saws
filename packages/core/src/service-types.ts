export type ServiceOutputs = Record<string, string | number | boolean | undefined>;
export type EnvironmentVariables = Record<string, string>;
export type EnvironmentVariableTarget = "host" | "container";

export interface ServicePermission {
  provider: string;
  actions: string[];
  resources: string[];
}

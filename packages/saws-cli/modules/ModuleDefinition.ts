import { Readable } from "stream";
import { ModuleType, ServiceType } from "@shichongrui/saws-core";

export type AWSPermission = {
  Effect: 'Allow' | 'Deny';
  Action: string[];
  Resource: string
} | {
  Effect: 'Allow' | 'Deny';
  Action: string[];
  Resource: { [k: string]: any }
}

export interface ModuleDefinition {
  name: string;
  type: ServiceType | ModuleType;
  dev: () => Promise<void>;
  deploy: (stage: string) => Promise<void>;
  setOutputs: (outputs: Outputs) => void; 
  getOutputs: () => Outputs;
  getEnvironmentVariables: () => Promise<Record<string, string>>;
  getStdOut: () => Readable | null | undefined;
  getPermissions: (dependantType: ModuleType, stage: string) => Array<AWSPermission>;
  exit: () => void;
}

export type Outputs = Record<
  string,
  string | number | boolean | null | undefined
>;

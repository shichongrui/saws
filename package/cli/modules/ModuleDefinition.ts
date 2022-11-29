import { Readable } from "stream";
import { ModuleType, ServiceType } from "../../config";

export interface ModuleDefinition {
  name: string;
  type: ServiceType | ModuleType;
  dev: () => Promise<void>;
  deploy: (stage: string) => Promise<void>;
  setOutputs: (outputs: Outputs) => void; 
  getOutputs: () => Outputs;
  getEnvironmentVariables: () => Record<string, string>;
  getStdOut: () => Readable | null | undefined;
  exit: () => void;
}

export type Outputs = Record<
  string,
  string | number | boolean | null | undefined
>;

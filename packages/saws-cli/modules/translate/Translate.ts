import { Readable } from "stream";
import {
  ModuleType,
  PostgresConfig,
  ServiceType,
  TranslateConfig,
} from "@shichongrui/saws-core";
import { ModuleDefinition, Outputs } from "../ModuleDefinition";

export class Translate implements ModuleDefinition {
  name: string;
  type = ServiceType.TRANSLATE;

  constructor(name: string, config: TranslateConfig) {
    this.name = name;
  }

  async dev() {
    // no op
  }

  async deploy(stage: string) {
    // no op
  }

  setOutputs(outputs: Outputs) {
    // no op
  }

  getOutputs() {
    return {};
  }

  async getEnvironmentVariables() {
    return {};
  }

  getStdOut() {
    return null;
  }

  getPermissions(_: ModuleType) {
    return [
      {
        Effect: "Allow" as const,
        Action: ["translate:TranslateText"],
        Resource: "*",
      },
    ];
  }

  exit() {
    // no op
  }
}

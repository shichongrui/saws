import { Readable } from "stream";
import { writeStageOutputs } from "./stage-outputs";

export interface ServiceDefinitionConfig {
  name: string;
  dependencies?: ServiceDefinition[];
}

export type Outputs = Record<
  string,
  string | number | boolean | null | undefined
>;

export class ServiceDefinition {
  name: string;
  dependencies: ServiceDefinition[];
  outputs: Outputs = {};

  constructor(config: ServiceDefinitionConfig) {
    this.name = config.name;
    this.dependencies = config.dependencies ?? [];
  }

  async dev() {
    console.log("Start dev", this.name);
    await this.forEachDependencyAsync((dependency) => {
      return dependency.dev();
    });
  }

  async deploy(stage: string) {
    console.log("Start deploy", this.name);
    await this.forEachDependencyAsync((dependency) => {
      return dependency.deploy(stage);
    })
  }

  async setOutputs(outputs: Outputs, stage: string) {
    this.outputs = {
      ...this.outputs,
      ...outputs,
    };
    await writeStageOutputs(
      {
        [this.name]: this.outputs,
      },
      stage
    );
  }

  forEachDependency(
    callback: (serviceDefinition: ServiceDefinition) => void
  ) {
    for (const dependency of this.dependencies) {
      dependency.forEachDependency(callback);
      callback(dependency);
    }
  }

  async forEachDependencyAsync(
    callback: (serviceDefinition: ServiceDefinition) => Promise<void>
  ) {
    for (const dependency of this.dependencies) {
      await dependency.forEachDependencyAsync(callback);
      await callback(dependency);
    }
  }

  // this needs to be recursive down dependencies
  exit() {
    this.forEachDependency((dependency) => dependency.exit());
  }

  // this needs to be recursive down dependencies
  async getEnvironmentVariables(): Promise<Record<string, string>> {
    const environmentVariables: Record<string, string> = {};
    await this.forEachDependencyAsync(async (definition) => {
      Object.assign(
        environmentVariables,
        await definition.getEnvironmentVariables()
      );
    });
    return environmentVariables;
  }

  getStdOut(): Readable | null | undefined {
    return null;
  }
}

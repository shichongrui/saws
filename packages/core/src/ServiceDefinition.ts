import { Readable } from "stream";
import { writeStageOutputs, type Outputs } from "@shichongrui/saws-utils/stage-outputs";
import type { AWSPermission } from "@shichongrui/saws-utils/aws-permission";
import { parameterizedEnvVarName } from "@shichongrui/saws-utils/parameterized-env-var-name"

export interface ServiceDefinitionConfig {
  name: string;
  dependencies?: ServiceDefinition[];
}

export class ServiceDefinition {
  name: string;
  dependencies: ServiceDefinition[];
  outputs: Outputs = {};
  deved: boolean = false
  deployed: boolean = false

  constructor(config: ServiceDefinitionConfig) {
    this.name = config.name;
    this.dependencies = config.dependencies ?? [];
  }

  async dev() {
    console.log("Start dev", this.name);
    await this.forEachDependencyAsync(async (dependency) => {
      if (dependency.deved) return
      await dependency.dev();
      dependency.deved = true
    });
  }

  async deploy(stage: string) {
    console.log("Start deploy", this.name);
    await this.forEachDependencyAsync(async (dependency) => {
      if (dependency.deployed) return
      await dependency.deploy(stage);
      dependency.deployed = true;
    });
  }

  getOutputs() {
    return this.outputs;
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

  forEachDependency(callback: (serviceDefinition: ServiceDefinition) => void) {
    for (const dependency of this.dependencies) {
      callback(dependency);
    }
  }

  async forEachDependencyAsync(
    callback: (serviceDefinition: ServiceDefinition) => Promise<void>
  ) {
    for (const dependency of this.dependencies) {
      await callback(dependency);
    }
  }

  getAllDependencies(): ServiceDefinition[] {
    const all: ServiceDefinition[] = [this]
    for (const dependency of this.dependencies) {
      all.push(dependency)
      all.push(...dependency.getAllDependencies())
    }

    return all
  }

  // this needs to be recursive down dependencies
  exit() {
    this.forEachDependency((dependency) => dependency.exit());
  }

  parameterizedEnvVarName(envVarName: string) {
    return parameterizedEnvVarName(this.name, envVarName);
  }

  // this needs to be recursive down dependencies
  async getEnvironmentVariables(stage: string): Promise<Record<string, string>> {
    return {}
  }

  async getDependenciesEnvironmentVariables(stage: string): Promise<Record<string, string>> {
    const environmentVariables: Record<string, string> = {};
    await this.forEachDependencyAsync(async (definition) => {
      Object.assign(
        environmentVariables,
        await definition.getEnvironmentVariables(stage)
      );
    });
    return environmentVariables;
  }


  getStdOut(): Readable | null | undefined {
    return null;
  }

  getPermissions(stage: string): AWSPermission[] {
    return [];
  }
}

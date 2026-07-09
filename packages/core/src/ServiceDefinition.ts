import { Readable } from "node:stream";
import { writeStageOutputs, type Outputs } from "./utils/stage-outputs.js";
import { parameterizedEnvVarName } from "./utils/parameterized-env-var-name.js";
import { SecretReference } from "./secrets-manager.js";

export interface RuntimeLogEntry {
  serviceName: string;
  stream: "stdout" | "stderr";
  chunk: string;
  timestamp: Date;
}

export type RuntimeLogSink = (entry: RuntimeLogEntry) => void;

export type ServiceEnvironmentVariableValue = string | SecretReference;
export type ServiceEnvironmentTarget = "container" | "host";

export type StageEnvironmentVariables = Record<
  string,
  Record<string, ServiceEnvironmentVariableValue>
>;

export interface ServiceDefinitionConfig {
  name: string;
  dependencies?: ServiceDefinition[];
  environment?: StageEnvironmentVariables;
}

export class ServiceDefinition {
  name: string;
  dependencies: ServiceDefinition[];
  readonly environment: StageEnvironmentVariables;
  outputs: Outputs = {};
  deved: boolean = false;
  deployed: boolean = false;
  private runtimeLogSink?: RuntimeLogSink;

  constructor(config: ServiceDefinitionConfig) {
    this.name = config.name;
    this.dependencies = config.dependencies ?? [];
    this.environment = config.environment ?? {};
  }

  async init() {
    return;
  }

  async dev() {
    this.writeRuntimeLog(`Start dev ${this.name}\n`);
    await this.forEachDependencyAsync(async (dependency) => {
      if (dependency.deved) return;
      await dependency.dev();
      dependency.deved = true;
    });
  }

  async deploy(stage: string) {
    console.log("Start deploy", this.name);
    await this.forEachDependencyAsync(async (dependency) => {
      if (dependency.deployed) return;
      await dependency.deploy(stage);
      dependency.deployed = true;
    });
  }

  setRuntimeLogSink(sink: RuntimeLogSink | undefined) {
    this.runtimeLogSink = sink;
    this.forEachDependency((dependency) => dependency.setRuntimeLogSink(sink));
  }

  protected writeRuntimeLog(chunk: string, stream: "stdout" | "stderr" = "stdout") {
    if (this.runtimeLogSink == null) {
      const output = stream === "stderr" ? process.stderr : process.stdout;
      output.write(chunk);
      return;
    }

    this.runtimeLogSink({
      serviceName: this.name,
      stream,
      chunk,
      timestamp: new Date(),
    });
  }

  protected getRuntimeLogSink() {
    return this.runtimeLogSink;
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
      stage,
    );
  }

  forEachDependency(callback: (serviceDefinition: ServiceDefinition) => void) {
    for (const dependency of this.dependencies) {
      callback(dependency);
    }
  }

  async forEachDependencyAsync(callback: (serviceDefinition: ServiceDefinition) => Promise<void>) {
    for (const dependency of this.dependencies) {
      await callback(dependency);
    }
  }

  getAllDependencies(): ServiceDefinition[] {
    const all: ServiceDefinition[] = [this];
    for (const dependency of this.dependencies) {
      all.push(dependency);
      all.push(...dependency.getAllDependencies());
    }

    return all;
  }

  // this needs to be recursive down dependencies
  exit() {
    this.forEachDependency((dependency) => dependency.exit());
  }

  parameterizedEnvVarName(envVarName: string) {
    return parameterizedEnvVarName(this.name, envVarName);
  }

  // this needs to be recursive down dependencies
  async getEnvironmentVariables(
    stage: string,
    _target: ServiceEnvironmentTarget = "container",
  ): Promise<Record<string, string>> {
    return {};
  }

  async getDependenciesEnvironmentVariables(
    stage: string,
    target: ServiceEnvironmentTarget = "container",
  ): Promise<Record<string, string>> {
    const environmentVariables: Record<string, string> = {};
    await this.forEachDependencyAsync(async (definition) => {
      Object.assign(environmentVariables, await definition.getEnvironmentVariables(stage, target));
    });
    return environmentVariables;
  }

  protected async getStageEnvironmentVariables(stage: string): Promise<Record<string, string>> {
    const environment = this.environment[stage] ?? {};
    return Object.fromEntries(
      await Promise.all(
        Object.entries(environment).map(async ([name, value]) => [
          name,
          value instanceof SecretReference ? await value.resolve({ stage }) : value,
        ]),
      ),
    );
  }

  getStdOut(): Readable | null | undefined {
    return null;
  }

  getStdErr(): Readable | null | undefined {
    return null;
  }
}

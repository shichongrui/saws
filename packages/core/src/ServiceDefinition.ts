import { Readable } from "node:stream";
import path from "node:path";
import { writeStageOutputs, type Outputs } from "./utils/stage-outputs.js";
import { parameterizedEnvVarName } from "./utils/parameterized-env-var-name.js";
import { runLocal } from "./utils/run-local.js";
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
export interface ServiceHookContext {
  signal: AbortSignal;
  log(chunk: string, stream?: "stdout" | "stderr"): void;
}

export type ServiceHook = string | ((context: ServiceHookContext) => Promise<void>);

export type StageEnvironmentVariables = Record<
  string,
  Record<string, ServiceEnvironmentVariableValue>
>;

export interface ServiceDefinitionConfig {
  name: string;
  dependencies?: ServiceDefinition[];
  environment?: StageEnvironmentVariables;
  /** Commands or functions to run before this service starts in local development. */
  onDev?: ServiceHook[];
  /** Commands or functions to run locally before this service is deployed. */
  onDeploy?: ServiceHook[];
}

export class ServiceDefinition {
  name: string;
  dependencies: ServiceDefinition[];
  readonly environment: StageEnvironmentVariables;
  readonly onDev: ServiceHook[];
  readonly onDeploy: ServiceHook[];
  outputs: Outputs = {};
  deved: boolean = false;
  deployed: boolean = false;
  private runtimeLogSink?: RuntimeLogSink;
  private readonly onDevAbortController = new AbortController();

  constructor(config: ServiceDefinitionConfig) {
    this.name = config.name;
    this.dependencies = config.dependencies ?? [];
    this.environment = config.environment ?? {};
    this.onDev = config.onDev ?? [];
    this.onDeploy = config.onDeploy ?? [];
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
    this.startDevHooks();
  }

  async deploy(stage: string) {
    console.log("Start deploy", this.name);
    await this.forEachDependencyAsync(async (dependency) => {
      if (dependency.deployed) return;
      await dependency.deploy(stage);
      dependency.deployed = true;
    });
    await this.runHooks(this.onDeploy, "onDeploy");
  }

  async logs(_stage: string) {
    return;
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

  getOnDevLogTabs() {
    return this.onDev.map((_hook, index) => this.getHookLogTabName("onDev", index));
  }

  // this needs to be recursive down dependencies
  exit() {
    this.onDevAbortController.abort();
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

  private async runHooks(hooks: ServiceHook[], hookName: "onDev" | "onDeploy") {
    await Promise.all(hooks.map((hook, index) => this.runHook(hook, hookName, index)));
  }

  private startDevHooks() {
    for (const [index, hook] of this.onDev.entries()) {
      void this.runHook(hook, "onDev", index, this.onDevAbortController.signal).catch((error) => {
        if (this.onDevAbortController.signal.aborted) return;
        this.writeHookLog(
          this.getHookLogTabName("onDev", index),
          `${(error as Error).message}\n`,
          "stderr",
        );
      });
    }
  }

  private async runHook(
    hook: ServiceHook,
    hookName: "onDev" | "onDeploy",
    index: number,
    signal = new AbortController().signal,
  ) {
    const serviceName = this.getHookLogTabName(hookName, index);
    if (typeof hook === "function") {
      await hook({
        signal,
        log: (chunk, stream = "stdout") => this.writeHookLog(serviceName, chunk, stream),
      });
      return;
    }

    await runLocal(hook, {
      cwd: this.getServiceDirectory(),
      logSink: this.runtimeLogSink,
      serviceName,
      signal,
    });
  }

  private writeHookLog(serviceName: string, chunk: string, stream: "stdout" | "stderr") {
    if (this.runtimeLogSink == null) {
      const output = stream === "stderr" ? process.stderr : process.stdout;
      output.write(chunk);
      return;
    }

    this.runtimeLogSink({ serviceName, stream, chunk, timestamp: new Date() });
  }

  private getServiceDirectory() {
    if (this.constructor === ServiceDefinition) return process.cwd();
    return path.resolve(this.name);
  }

  private getHookLogTabName(hookName: "onDev" | "onDeploy", index: number) {
    return `${this.name}: ${hookName} ${index + 1}`;
  }
}

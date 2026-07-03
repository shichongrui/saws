import {
  DeployContext,
  DevContext,
  ExitContext,
  InitContext,
  RuntimeContext,
} from "./context.js";
import type { Command } from "commander";
import type {
  EnvironmentVariables,
  EnvironmentVariableTarget,
  ServiceOutputs,
  ServicePermission,
} from "./service-types.js";

export interface ServiceDefinitionConfig {
  name: string;
  dependencies?: ServiceDefinition[];
}

export class ServiceDefinition {
  static getCommands(): Command[] {
    return [];
  }

  readonly name: string;
  readonly dependencies: ServiceDefinition[];

  private initializedStages = new Set<string>();
  private devedStages = new Set<string>();
  private deployedStages = new Set<string>();
  private outputsByStage = new Map<string, ServiceOutputs>();

  constructor(config: ServiceDefinitionConfig) {
    this.name = config.name;
    this.dependencies = config.dependencies ?? [];
  }

  async init(context = new InitContext({ stage: "local" })) {
    if (this.initializedStages.has(context.stage)) return;

    for (const dependency of this.dependencies) {
      await dependency.init(initContextForService(context, dependency.name));
    }

    await this.onInit(initContextForService(context, this.name));
    this.initializedStages.add(context.stage);
  }

  async dev(context = new DevContext({ stage: "local" })) {
    if (this.devedStages.has(context.stage)) return;
    await this.init(initContextForService(context, this.name));

    for (const dependency of this.dependencies) {
      await dependency.dev(devContextForService(context, dependency.name));
    }

    await this.onDev(devContextForService(context, this.name));
    this.devedStages.add(context.stage);
  }

  async deploy(contextOrStage: DeployContext | string) {
    const context =
      typeof contextOrStage === "string"
        ? new DeployContext({ stage: contextOrStage })
        : contextOrStage;

    if (this.deployedStages.has(context.stage)) return;

    for (const dependency of this.dependencies) {
      await dependency.deploy(context);
    }

    await this.onDeploy(context);
    this.deployedStages.add(context.stage);
  }

  async exit(context = new ExitContext({ stage: "local" })) {
    await this.onExit(context);

    for (const dependency of this.dependencies) {
      await dependency.exit(context);
    }
  }

  setOutputs(stage: string, outputs: ServiceOutputs) {
    this.outputsByStage.set(stage, {
      ...this.outputsByStage.get(stage),
      ...outputs,
    });
  }

  async getOutputs(context: RuntimeContext): Promise<ServiceOutputs> {
    return this.outputsByStage.get(context.stage) ?? {};
  }

  async getEnvironmentVariables(
    context: RuntimeContext,
    _target: EnvironmentVariableTarget = "host"
  ): Promise<EnvironmentVariables> {
    return {};
  }

  async getDependenciesEnvironmentVariables(
    context: RuntimeContext,
    target: EnvironmentVariableTarget = "host"
  ): Promise<EnvironmentVariables> {
    const environment: EnvironmentVariables = {};

    for (const dependency of this.dependencies) {
      Object.assign(
        environment,
        await dependency.getEnvironmentVariables(context, target)
      );
    }

    return environment;
  }

  async getPermissions(context: RuntimeContext): Promise<ServicePermission[]> {
    return [];
  }

  /**
   * Bootstrap application-owned files or dependencies required by this
   * service. Implementations must be safe to run again in a later process and
   * should resolve generated paths from context.rootDir.
   */
  protected async onInit(_context: InitContext) {}
  protected async onDev(_context: DevContext) {}
  protected async onDeploy(_context: DeployContext) {}
  protected async onExit(_context: ExitContext) {}
}

function initContextForService(context: RuntimeContext, serviceName: string) {
  return new InitContext({
    stage: context.stage,
    rootDir: context.rootDir,
    env: context.env,
    dryRun: context.dryRun,
    logSink: context.logSink,
    currentServiceName: serviceName,
  });
}

function devContextForService(context: RuntimeContext, serviceName: string) {
  return new DevContext({
    stage: context.stage,
    rootDir: context.rootDir,
    env: context.env,
    dryRun: context.dryRun,
    logSink: context.logSink,
    currentServiceName: serviceName,
  });
}

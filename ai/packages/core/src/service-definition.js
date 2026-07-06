import { DeployContext, DevContext, ExitContext, InitContext, } from "./context.js";
export class ServiceDefinition {
    static getCommands(_services = []) {
        return [];
    }
    name;
    dependencies;
    initializedStages = new Set();
    devedStages = new Set();
    deployedStages = new Set();
    outputsByStage = new Map();
    constructor(config) {
        this.name = config.name;
        this.dependencies = config.dependencies ?? [];
    }
    async init(context = new InitContext({ stage: "local" })) {
        if (this.initializedStages.has(context.stage))
            return;
        for (const dependency of this.dependencies) {
            await dependency.init(initContextForService(context, dependency.name));
        }
        await this.onInit(initContextForService(context, this.name));
        this.initializedStages.add(context.stage);
    }
    async dev(context = new DevContext({ stage: "local" })) {
        if (this.devedStages.has(context.stage))
            return;
        await this.init(initContextForService(context, this.name));
        for (const dependency of this.dependencies) {
            await dependency.dev(devContextForService(context, dependency.name));
        }
        await this.onDev(devContextForService(context, this.name));
        this.devedStages.add(context.stage);
    }
    async deploy(contextOrStage) {
        const context = typeof contextOrStage === "string"
            ? new DeployContext({ stage: contextOrStage })
            : contextOrStage;
        if (this.deployedStages.has(context.stage))
            return;
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
    setOutputs(stage, outputs) {
        this.outputsByStage.set(stage, {
            ...this.outputsByStage.get(stage),
            ...outputs,
        });
    }
    async getOutputs(context) {
        return this.outputsByStage.get(context.stage) ?? {};
    }
    async getEnvironmentVariables(context, _target = "host") {
        return {};
    }
    async getDependenciesEnvironmentVariables(context, target = "host") {
        const environment = {};
        for (const dependency of this.dependencies) {
            Object.assign(environment, await dependency.getEnvironmentVariables(context, target));
        }
        return environment;
    }
    async getPermissions(context) {
        return [];
    }
    /**
     * Bootstrap application-owned files or dependencies required by this
     * service. Implementations must be safe to run again in a later process and
     * should resolve generated paths from context.rootDir.
     */
    async onInit(_context) { }
    async onDev(_context) { }
    async onDeploy(_context) { }
    async onExit(_context) { }
}
function initContextForService(context, serviceName) {
    return new InitContext({
        stage: context.stage,
        rootDir: context.rootDir,
        env: context.env,
        dryRun: context.dryRun,
        logSink: context.logSink,
        currentServiceName: serviceName,
    });
}
function devContextForService(context, serviceName) {
    return new DevContext({
        stage: context.stage,
        rootDir: context.rootDir,
        env: context.env,
        dryRun: context.dryRun,
        logSink: context.logSink,
        currentServiceName: serviceName,
    });
}

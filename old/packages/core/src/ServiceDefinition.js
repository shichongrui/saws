"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServiceDefinition = void 0;
const stage_outputs_1 = require("@saws/utils/stage-outputs");
const parameterized_env_var_name_1 = require("@saws/utils/parameterized-env-var-name");
class ServiceDefinition {
    name;
    dependencies;
    outputs = {};
    deved = false;
    deployed = false;
    constructor(config) {
        this.name = config.name;
        this.dependencies = config.dependencies ?? [];
    }
    async init() {
        return;
    }
    async dev() {
        console.log("Start dev", this.name);
        await this.init();
        await this.forEachDependencyAsync(async (dependency) => {
            if (dependency.deved)
                return;
            await dependency.dev();
            dependency.deved = true;
        });
    }
    async deploy(stage) {
        console.log("Start deploy", this.name);
        await this.forEachDependencyAsync(async (dependency) => {
            if (dependency.deployed)
                return;
            await dependency.deploy(stage);
            dependency.deployed = true;
        });
    }
    getOutputs() {
        return this.outputs;
    }
    async setOutputs(outputs, stage) {
        this.outputs = {
            ...this.outputs,
            ...outputs,
        };
        await (0, stage_outputs_1.writeStageOutputs)({
            [this.name]: this.outputs,
        }, stage);
    }
    forEachDependency(callback) {
        for (const dependency of this.dependencies) {
            callback(dependency);
        }
    }
    async forEachDependencyAsync(callback) {
        for (const dependency of this.dependencies) {
            await callback(dependency);
        }
    }
    getAllDependencies() {
        const all = [this];
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
    parameterizedEnvVarName(envVarName) {
        return (0, parameterized_env_var_name_1.parameterizedEnvVarName)(this.name, envVarName);
    }
    // this needs to be recursive down dependencies
    async getEnvironmentVariables(stage) {
        return {};
    }
    async getDependenciesEnvironmentVariables(stage) {
        const environmentVariables = {};
        await this.forEachDependencyAsync(async (definition) => {
            Object.assign(environmentVariables, await definition.getEnvironmentVariables(stage));
        });
        return environmentVariables;
    }
    getStdOut() {
        return null;
    }
    getPermissions(stage) {
        return [];
    }
}
exports.ServiceDefinition = ServiceDefinition;

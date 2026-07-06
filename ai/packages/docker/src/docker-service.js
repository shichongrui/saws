import { DeployContext, } from "@saws/core";
import { ServiceDefinition, } from "@saws/core";
/**
 * A service backed by a Docker image.
 *
 * Development runs the container on the local Docker daemon and attaches its
 * output to the SAWS log sink. Deployment replaces a detached container on the
 * DockerProvider's host.
 */
export class DockerService extends ServiceDefinition {
    docker;
    image;
    dockerfile;
    buildContext;
    environment;
    volumes;
    ports;
    command;
    labels;
    restart;
    healthCheck;
    devProcess;
    devEnvironmentFile;
    constructor(config) {
        super(config);
        if ((config.image == null) === (config.dockerfile == null)) {
            throw new Error(`Docker service "${config.name}" requires exactly one of image or dockerfile`);
        }
        this.docker = config.docker;
        this.image = config.image;
        this.dockerfile = config.dockerfile;
        this.buildContext = config.buildContext;
        this.environment = config.environment ?? {};
        this.volumes = config.volumes ?? [];
        this.ports = config.ports ?? [];
        this.command = config.command ?? [];
        this.labels = config.labels ?? {};
        this.restart = config.restart;
        this.healthCheck = config.healthCheck;
    }
    get serviceType() {
        return "docker";
    }
    getContainerName(context) {
        return `${context.stage}-${this.name}`.replaceAll("_", "-").toLowerCase();
    }
    async getContainerEnvironment(context) {
        return {
            ...await this.getDependenciesEnvironmentVariables(context, "container"),
            ...this.environment,
        };
    }
    async getDockerRunConfig(context) {
        return {
            name: this.getContainerName(context),
            image: this.getImage(context),
            pull: this.dockerfile == null || context instanceof DeployContext,
            network: this.docker.getNetwork(context),
            env: await this.getContainerEnvironment(context),
            volumes: this.volumes,
            ports: this.ports,
            command: this.command,
            restart: this.restart,
            healthCheck: this.healthCheck,
            labels: {
                ...this.labels,
                "saws.service": this.name,
                "saws.serviceType": this.serviceType,
                "saws.stage": context.stage,
            },
        };
    }
    async onDeploy(context) {
        await this.docker.assertHostReady(context);
        await this.prepareImage(context);
        const config = await this.getDockerRunConfig(context);
        config.configHash = this.docker.getContainerConfigHash(config);
        let environmentFile;
        try {
            environmentFile = await this.writeDeployEnvironmentFile(context, config);
            await this.docker.runContainer(context, config);
        }
        finally {
            if (environmentFile != null) {
                await this.docker.removeRuntimeFile(context, environmentFile);
            }
        }
        await this.onContainerStarted(context);
    }
    async onDev(context) {
        await this.prepareImage(context);
        const config = await this.getDockerRunConfig(context);
        try {
            this.devEnvironmentFile = await this.writeDevEnvironmentFile(context, config);
            this.devProcess = await this.docker.startLocalContainer(context, config);
            this.observeDevProcess(context, this.devProcess);
        }
        catch (error) {
            await this.removeDevEnvironmentFile();
            throw error;
        }
        await this.onContainerStarted(context);
    }
    async onExit(_context) {
        this.devProcess?.kill();
        this.devProcess = undefined;
        await this.removeDevEnvironmentFile();
    }
    async onContainerStarted(_context) { }
    getImage(context) {
        return this.image ?? this.docker.getBuiltImageName(context, this.name);
    }
    async prepareImage(context) {
        if (this.dockerfile == null)
            return;
        const image = this.getImage(context);
        await this.docker.buildImage(context, {
            dockerfile: this.dockerfile,
            context: this.buildContext,
            image,
        });
        if (context instanceof DeployContext) {
            await this.docker.pushImage(context, image);
        }
    }
    async writeDeployEnvironmentFile(context, config) {
        const contents = serializeEnvironment(config.env);
        if (contents == null)
            return undefined;
        const runtimeFile = await this.docker.writeRuntimeFile(context, `${this.name}/container.env`, contents);
        config.env = undefined;
        config.envFiles = [...(config.envFiles ?? []), runtimeFile.remotePath];
        return runtimeFile;
    }
    async writeDevEnvironmentFile(context, config) {
        const contents = serializeEnvironment(config.env);
        if (contents == null)
            return undefined;
        const localPath = await this.docker.writeLocalRuntimeFile(context, `${this.name}/container.env`, contents);
        config.env = undefined;
        config.envFiles = [...(config.envFiles ?? []), localPath];
        return localPath;
    }
    observeDevProcess(context, process) {
        process.once("error", (error) => {
            context.writeLog(`${error.stack ?? error.message}\n`, "stderr");
        });
        process.once("exit", (code, signal) => {
            if (this.devProcess === process)
                this.devProcess = undefined;
            if (code !== 0 && signal !== "SIGTERM" && signal !== "SIGINT") {
                context.writeLog(`Docker container exited with code ${code ?? "unknown"}${signal == null ? "" : ` (${signal})`}\n`, "stderr");
            }
        });
    }
    async removeDevEnvironmentFile() {
        if (this.devEnvironmentFile == null)
            return;
        const localPath = this.devEnvironmentFile;
        this.devEnvironmentFile = undefined;
        await this.docker.removeLocalRuntimeFile(localPath);
    }
}
function serializeEnvironment(environment) {
    const entries = Object.entries(environment ?? {});
    if (entries.length === 0)
        return undefined;
    for (const [key, value] of entries) {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
            throw new Error(`Invalid Docker environment variable name: ${key}`);
        }
        if (value.includes("\n") || value.includes("\r")) {
            throw new Error(`Docker environment variable ${key} contains a newline`);
        }
    }
    return `${entries.map(([key, value]) => `${key}=${value}`).join("\n")}\n`;
}

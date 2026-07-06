import { randomBytes } from "node:crypto";
import { DeployContext, DevContext, } from "@saws/core";
import { DockerService, } from "@saws/docker";
import { SecretsManager } from "@saws/secrets";
import { rustFSServiceEnvironmentPrefix } from "./files.js";
/**
 * A persistent single-node RustFS server with dependency environment injection.
 */
export class RustFSService extends DockerService {
    port;
    consolePort;
    accessKeyId;
    secretAccessKey;
    region;
    bucket;
    volume;
    dataDirectory;
    constructor(config) {
        const port = config.port ?? 9000;
        const consolePort = config.consolePort ?? 9001;
        super({
            ...config,
            image: config.image ?? "rustfs/rustfs:latest",
            ports: [`${port}:9000`, `${consolePort}:9001`],
            command: [config.dataDirectory ?? "/data"],
        });
        this.port = port;
        this.consolePort = consolePort;
        this.accessKeyId = config.accessKeyId ?? "rustfsadmin";
        this.secretAccessKey = config.secretAccessKey;
        this.region = config.region ?? "us-east-1";
        this.bucket = config.bucket;
        this.volume = config.volume;
        this.dataDirectory = config.dataDirectory ?? "/data";
    }
    get serviceType() {
        return "rustfs";
    }
    async getContainerEnvironment(context) {
        const connection = await this.getConnectionInfo(context, "container");
        return {
            ...await super.getContainerEnvironment(context),
            RUSTFS_ACCESS_KEY: connection.accessKeyId,
            RUSTFS_SECRET_KEY: connection.secretAccessKey,
            RUSTFS_CONSOLE_ENABLE: "true",
        };
    }
    async getDockerRunConfig(context) {
        const config = await super.getDockerRunConfig(context);
        return {
            ...config,
            volumes: [`${this.getVolumeName(context)}:${this.dataDirectory}`],
        };
    }
    async onContainerStarted(context) {
        this.setOutputs(context.stage, this.toOutputs(await this.getConnectionInfo(context)));
    }
    async getOutputs(context) {
        const outputs = this.toOutputs(await this.getConnectionInfo(context));
        this.setOutputs(context.stage, outputs);
        return outputs;
    }
    async getEnvironmentVariables(context, target = "host") {
        const connection = await this.getConnectionInfo(context, target);
        const prefix = rustFSServiceEnvironmentPrefix(this.name);
        return {
            [`${prefix}_RUSTFS_ENDPOINT`]: connection.endpoint,
            [`${prefix}_RUSTFS_ACCESS_KEY_ID`]: connection.accessKeyId,
            [`${prefix}_RUSTFS_SECRET_ACCESS_KEY`]: connection.secretAccessKey,
            [`${prefix}_RUSTFS_REGION`]: connection.region,
            [`${prefix}_RUSTFS_BUCKET`]: connection.bucket,
        };
    }
    async getConnectionInfo(context, target = "host") {
        return {
            endpoint: this.getEndpoint(context, target),
            accessKeyId: this.accessKeyId,
            secretAccessKey: this.secretAccessKey ?? await this.getOrCreateSecretAccessKey(context),
            region: this.region,
            bucket: this.bucket ?? this.defaultBucketName(context),
        };
    }
    getEndpoint(context, target) {
        if (target === "container") {
            return `http://${this.getContainerName(context)}:9000`;
        }
        if (context instanceof DeployContext) {
            return httpUrl(this.docker.host.address, this.port);
        }
        return httpUrl(context instanceof DevContext || context.stage === "local"
            ? "127.0.0.1"
            : this.docker.host.address, this.port);
    }
    toOutputs(connection) {
        return {
            endpoint: connection.endpoint,
            accessKeyId: connection.accessKeyId,
            secretAccessKey: connection.secretAccessKey,
            region: connection.region,
            bucket: connection.bucket,
        };
    }
    getVolumeName(context) {
        return (this.volume ??
            `${context.stage}-${this.name}-rustfs-data`
                .replaceAll("_", "-")
                .toLowerCase());
    }
    defaultBucketName(context) {
        return `${context.stage}-${this.name}`
            .toLowerCase()
            .replace(/[^a-z0-9.-]/g, "-");
    }
    async getOrCreateSecretAccessKey(context) {
        const manager = new SecretsManager({
            stage: context.stage,
            rootDir: context.rootDir,
        });
        const secretName = `${this.name}-rustfs-secret-access-key`;
        try {
            return await manager.get(secretName);
        }
        catch (error) {
            if (error.name !== "ParameterNotFound")
                throw error;
        }
        const value = randomBytes(32).toString("base64url");
        await manager.set(secretName, value);
        return value;
    }
}
function httpUrl(host, port) {
    const normalizedHost = host
        .replace(/^https?:\/\//, "")
        .replace(/\/+$/, "");
    return `http://${normalizedHost}:${port}`;
}

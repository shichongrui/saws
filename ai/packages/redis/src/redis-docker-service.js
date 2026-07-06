import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { DevContext, } from "@saws/core";
import { DockerService, } from "@saws/docker";
import { SecretsManager } from "@saws/secrets";
export class RedisDockerService extends DockerService {
    port;
    password;
    volume;
    dataDirectory;
    constructor(config) {
        super({
            ...config,
            image: config.image ?? "redis:7",
            healthCheck: config.healthCheck ?? {
                command: 'redis-cli -a "$REDIS_PASSWORD" ping',
                interval: "10s",
                timeout: "5s",
                retries: 5,
                startPeriod: "10s",
            },
        });
        this.port = config.port;
        this.password = config.password;
        this.volume = config.volume;
        this.dataDirectory = config.dataDirectory ?? "/data";
    }
    get envPrefix() {
        return this.name.replaceAll("-", "_").toUpperCase();
    }
    get serviceType() {
        return "redis-docker";
    }
    async getContainerEnvironment(context) {
        const connection = await this.getConnectionInfo(context);
        return {
            ...await super.getContainerEnvironment(context),
            REDIS_PASSWORD: connection.password,
        };
    }
    async getDockerRunConfig(context) {
        const config = await super.getDockerRunConfig(context);
        const connection = await this.getConnectionInfo(context);
        return {
            ...config,
            volumes: [`${this.getVolumeName(context)}:${this.dataDirectory}`],
            ports: context instanceof DevContext
                ? [`${this.port ?? 6379}:6379`]
                : this.port == null ? [] : [`${this.port}:6379`],
            command: [
                "redis-server",
                "--requirepass",
                connection.password,
                "--save",
                "60",
                "1",
                "--loglevel",
                "warning",
            ],
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
        const prefix = this.envPrefix;
        return {
            [`${prefix}_REDIS_HOST`]: connection.host,
            [`${prefix}_REDIS_PORT`]: connection.port,
            [`${prefix}_REDIS_PASSWORD`]: connection.password,
            [`${prefix}_REDIS_URL`]: this.toRedisUrl(connection),
        };
    }
    async getConnectionInfo(context, target = "host") {
        const password = this.password ?? await this.getOrCreatePassword(context);
        const isContainerTarget = target === "container";
        return {
            host: isContainerTarget
                ? this.getContainerName(context)
                : isLocal(context)
                    ? "localhost"
                    : this.getContainerName(context),
            port: isContainerTarget
                ? "6379"
                : this.port != null
                    ? String(this.port)
                    : isLocal(context)
                        ? "6379"
                        : "6379",
            password,
        };
    }
    toOutputs(connection) {
        return {
            redisHost: connection.host,
            redisPort: connection.port,
            redisPassword: connection.password,
            redisUrl: this.toRedisUrl(connection),
        };
    }
    toRedisUrl(connection) {
        return `redis://:${encodeURIComponent(connection.password)}@${connection.host}:${connection.port}`;
    }
    getVolumeName(context) {
        return (this.volume ??
            `${context.stage}-${this.name}-redis-data`
                .replaceAll("_", "-")
                .toLowerCase());
    }
    async getOrCreatePassword(context) {
        const manager = new SecretsManager({
            stage: context.stage,
            rootDir: context.rootDir,
        });
        const secretName = this.getPasswordSecretName();
        try {
            return await manager.get(secretName);
        }
        catch (error) {
            if (error.name !== "ParameterNotFound")
                throw error;
        }
        const legacyPassword = await this.getLegacyPassword(context);
        if (legacyPassword != null) {
            await manager.set(secretName, legacyPassword);
            return legacyPassword;
        }
        const password = randomBytes(24).toString("base64url");
        await manager.set(secretName, password);
        return password;
    }
    getPasswordSecretName() {
        return `${this.name}-redis-password`;
    }
    async getLegacyPassword(context) {
        const secretPath = path.resolve(context.rootDir, ".saws", "secrets", context.stage, this.getPasswordSecretName());
        try {
            return (await readFile(secretPath, "utf8")).trim();
        }
        catch (error) {
            if (error.code !== "ENOENT")
                throw error;
            return null;
        }
    }
}
function isLocal(context) {
    return context instanceof DevContext || context.stage === "local";
}

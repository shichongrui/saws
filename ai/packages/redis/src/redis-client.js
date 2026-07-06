import { Redis as IORedis } from "ioredis";
/**
 * An IORedis client configured with the Redis URL injected by a SAWS Redis
 * service dependency.
 */
export class Redis extends IORedis {
    constructor(serviceName, options = {}) {
        const { environment, ...redisOptions } = options;
        const redisUrl = resolveRedisServiceUrl(serviceName, environment);
        const url = new URL(redisUrl);
        super({
            ...redisOptions,
            host: url.hostname,
            port: Number(url.port) || 6379,
            password: decodeURIComponent(url.password),
        });
    }
}
export function resolveRedisServiceUrl(serviceName, environment) {
    const variableName = redisServiceUrlEnvironmentVariable(serviceName);
    const value = environment?.[variableName] ??
        getRuntimeEnvironment()?.[variableName] ??
        getProcessEnvironment()?.[variableName];
    if (value == null || value.trim().length === 0) {
        throw new Error(`Redis service "${serviceName}" is not configured: ` +
            `${variableName} must be present in the SAWS environment`);
    }
    return value;
}
export function redisServiceUrlEnvironmentVariable(serviceName) {
    return `${serviceName.replaceAll("-", "_").toUpperCase()}_REDIS_URL`;
}
function getRuntimeEnvironment() {
    return globalThis.ENV;
}
function getProcessEnvironment() {
    return globalThis.process?.env;
}

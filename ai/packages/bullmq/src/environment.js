/**
 * BullMQ-free environment helpers shared by {@link BullMQWorkerService} and
 * {@link BullMQClient}. Kept separate from utils.ts so the SAWS CLI can use the
 * service without pulling the bullmq runtime into the deployment process.
 */
/** Environment variable holding the Redis URL for a BullMQ service dependency. */
export function bullmqServiceRedisUrlEnvironmentVariable(serviceName) {
    return `${normalizeServiceName(serviceName)}_REDIS_URL`;
}
/** Environment variable holding the resolved queue name for a BullMQ service. */
export function bullmqServiceQueueNameEnvironmentVariable(serviceName) {
    return `${normalizeServiceName(serviceName)}_QUEUE_NAME`;
}
/** Resolves the Redis URL a BullMQWorkerService injected for `serviceName`. */
export function resolveBullMQRedisUrl(serviceName, environment) {
    return resolveRequired(serviceName, bullmqServiceRedisUrlEnvironmentVariable(serviceName), environment);
}
/** Resolves the queue name a BullMQWorkerService injected for `serviceName`. */
export function resolveBullMQQueueName(serviceName, environment) {
    return resolveRequired(serviceName, bullmqServiceQueueNameEnvironmentVariable(serviceName), environment);
}
/** BullMQ connection options backed by a SAWS redis service URL. */
export function resolveBullMQConnection(serviceName, environment) {
    return { url: resolveBullMQRedisUrl(serviceName, environment) };
}
/** Serializes env vars into the `KEY=value` Docker env-file format. */
export function serializeEnvironment(environment) {
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
function resolveRequired(serviceName, variableName, environment) {
    const value = environment?.[variableName] ??
        getRuntimeEnvironment()?.[variableName] ??
        getProcessEnvironment()?.[variableName];
    if (value == null || value.trim().length === 0) {
        throw new Error(`BullMQ service "${serviceName}" is not configured: ` +
            `${variableName} must be present in the SAWS environment`);
    }
    return value;
}
function normalizeServiceName(serviceName) {
    return serviceName.replaceAll("-", "_").toUpperCase();
}
function getRuntimeEnvironment() {
    return globalThis.ENV;
}
function getProcessEnvironment() {
    return globalThis.process?.env;
}

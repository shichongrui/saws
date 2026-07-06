import { Pool } from "pg";
/**
 * A pg Pool configured with the database URL injected by a SAWS Postgres
 * service dependency.
 */
export class Postgres extends Pool {
    constructor(serviceName, options = {}) {
        const { environment, ...poolOptions } = options;
        super({
            ...poolOptions,
            connectionString: resolvePostgresServiceUrl(serviceName, environment),
        });
    }
}
export function resolvePostgresServiceUrl(serviceName, environment) {
    const variableName = postgresServiceUrlEnvironmentVariable(serviceName);
    const value = environment?.[variableName] ??
        getRuntimeEnvironment()?.[variableName] ??
        getProcessEnvironment()?.[variableName];
    if (value == null || value.trim().length === 0) {
        throw new Error(`Postgres service "${serviceName}" is not configured: ` +
            `${variableName} must be present in the SAWS environment`);
    }
    return value;
}
export function postgresServiceUrlEnvironmentVariable(serviceName) {
    return `${serviceName.replaceAll("-", "_").toUpperCase()}_DATABASE_URL`;
}
function getRuntimeEnvironment() {
    return globalThis.ENV;
}
function getProcessEnvironment() {
    return globalThis.process?.env;
}

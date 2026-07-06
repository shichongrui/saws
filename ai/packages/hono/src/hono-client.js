import { hc } from "hono/client";
import { honoServiceUrlEnvironmentVariable } from "./hono-http-service.js";
/**
 * Creates Hono's RPC client using the URL injected by a HonoHTTPService
 * dependency.
 */
function createHonoClient(serviceName, options = {}) {
    const { environment, ...clientOptions } = options;
    return hc(resolveHonoServiceUrl(serviceName, environment), clientOptions);
}
export const HonoClient = createHonoClient;
export function resolveHonoServiceUrl(serviceName, environment) {
    const variableName = honoServiceUrlEnvironmentVariable(serviceName);
    const value = environment?.[variableName] ??
        getRuntimeEnvironment()?.[variableName] ??
        getProcessEnvironment()?.[variableName];
    if (value == null || value.trim().length === 0) {
        throw new Error(`Hono service "${serviceName}" is not configured: ` +
            `${variableName} must be present in the SAWS environment`);
    }
    return value.replace(/\/+$/, "");
}
function getRuntimeEnvironment() {
    return globalThis.ENV;
}
function getProcessEnvironment() {
    return globalThis.process?.env;
}

import { Redis as IORedis, type RedisOptions } from "ioredis";

export interface RedisClientOptions extends RedisOptions {
  /** Explicit environment source for tests and application adapters. */
  environment?: Record<string, string | undefined>;
}

/**
 * An IORedis client configured with the Redis URL injected by a SAWS Redis
 * service dependency.
 */
export class Redis extends IORedis {
  constructor(serviceName: string, options: RedisClientOptions = {}) {
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

export function resolveRedisServiceUrl(
  serviceName: string,
  environment?: Record<string, string | undefined>
) {
  const variableName = redisServiceUrlEnvironmentVariable(serviceName);
  const value =
    environment?.[variableName] ??
    getRuntimeEnvironment()?.[variableName] ??
    getProcessEnvironment()?.[variableName];

  if (value == null || value.trim().length === 0) {
    throw new Error(
      `Redis service "${serviceName}" is not configured: ` +
      `${variableName} must be present in the SAWS environment`
    );
  }

  return value;
}

export function redisServiceUrlEnvironmentVariable(serviceName: string) {
  return `${serviceName.replaceAll("-", "_").toUpperCase()}_REDIS_URL`;
}

function getRuntimeEnvironment() {
  return (globalThis as typeof globalThis & {
    ENV?: Record<string, string | undefined>;
  }).ENV;
}

function getProcessEnvironment() {
  return (globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  }).process?.env;
}

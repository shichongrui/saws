import { Redis as IORedis, type RedisOptions } from "ioredis";

export interface RedisClientOptions extends RedisOptions {
  /** Explicit environment source for application adapters. */
  environment?: Record<string, string | undefined>;
}

export class RedisClient extends IORedis {
  constructor(serviceName: string, options: RedisClientOptions = {}) {
    const { environment, ...redisOptions } = options;

    super(resolveRedisServiceUrl(serviceName, environment), redisOptions);
  }
}

export function resolveRedisServiceUrl(
  serviceName: string,
  environment?: Record<string, string | undefined>,
) {
  const variableName = redisServiceUrlEnvironmentVariable(serviceName);
  const value =
    environment?.[variableName] ??
    getRuntimeEnvironment()?.[variableName] ??
    getProcessEnvironment()?.[variableName];

  if (value == null || value.trim().length === 0) {
    throw new Error(
      `Redis service "${serviceName}" is not configured: ` +
        `${variableName} must be present in the SAWS environment`,
    );
  }

  return value;
}

export function redisServiceUrlEnvironmentVariable(serviceName: string) {
  return `${serviceName.replace(/[^a-zA-Z\d]/g, "_").toUpperCase()}_REDIS_URL`;
}

function getRuntimeEnvironment() {
  return (
    globalThis as typeof globalThis & {
      ENV?: Record<string, string | undefined>;
    }
  ).ENV;
}

function getProcessEnvironment() {
  return (
    globalThis as typeof globalThis & {
      process?: { env?: Record<string, string | undefined> };
    }
  ).process?.env;
}

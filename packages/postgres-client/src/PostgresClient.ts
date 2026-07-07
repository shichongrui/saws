import { Pool, type PoolConfig } from "pg";

export interface PostgresClientOptions extends PoolConfig {
  /** Explicit environment source for application adapters. */
  environment?: Record<string, string | undefined>;
}

export class PostgresClient extends Pool {
  constructor(serviceName: string, options: PostgresClientOptions = {}) {
    const { environment, ...poolOptions } = options;

    super({
      connectionString: resolvePostgresServiceUrl(serviceName, environment),
      ...poolOptions,
    });
  }
}

export function resolvePostgresServiceUrl(
  serviceName: string,
  environment?: Record<string, string | undefined>,
) {
  const variableName = postgresServiceUrlEnvironmentVariable(serviceName);
  const value =
    environment?.[variableName] ??
    getRuntimeEnvironment()?.[variableName] ??
    getProcessEnvironment()?.[variableName];

  if (value == null || value.trim().length === 0) {
    throw new Error(
      `Postgres service "${serviceName}" is not configured: ` +
        `${variableName} must be present in the SAWS environment`,
    );
  }

  return value;
}

export function postgresServiceUrlEnvironmentVariable(serviceName: string) {
  return `${serviceName.replace(/[^a-zA-Z\d]/g, "_").toUpperCase()}_DATABASE_URL`;
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

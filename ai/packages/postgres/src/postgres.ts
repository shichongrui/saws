import { Pool, type PoolConfig } from "pg";

export interface PostgresOptions
  extends Omit<PoolConfig, "connectionString"> {
  /** Explicit environment source for tests and application adapters. */
  environment?: Record<string, string | undefined>;
}

/**
 * A pg Pool configured with the database URL injected by a SAWS Postgres
 * service dependency.
 */
export class Postgres extends Pool {
  constructor(serviceName: string, options: PostgresOptions = {}) {
    const { environment, ...poolOptions } = options;

    super({
      ...poolOptions,
      connectionString: resolvePostgresServiceUrl(serviceName, environment),
    });
  }
}

export function resolvePostgresServiceUrl(
  serviceName: string,
  environment?: Record<string, string | undefined>
) {
  const variableName = postgresServiceUrlEnvironmentVariable(serviceName);
  const value =
    environment?.[variableName] ??
    getRuntimeEnvironment()?.[variableName] ??
    getProcessEnvironment()?.[variableName];

  if (value == null || value.trim().length === 0) {
    throw new Error(
      `Postgres service "${serviceName}" is not configured: ` +
        `${variableName} must be present in the SAWS environment`
    );
  }

  return value;
}

export function postgresServiceUrlEnvironmentVariable(serviceName: string) {
  return `${serviceName.replaceAll("-", "_").toUpperCase()}_DATABASE_URL`;
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

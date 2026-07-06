import { hc, type ClientRequestOptions } from "hono/client";
import type { Hono } from "hono";

import { honoServiceUrlEnvironmentVariable } from "./hono-http-service.js";
type HonoApplication = Hono<any, any, any>;
type HonoRPCClient<T extends HonoApplication> = ReturnType<typeof hc<T>>;

export interface HonoClientOptions extends ClientRequestOptions {
  /** Explicit environment source for tests and application adapters. */
  environment?: Record<string, string | undefined>;
}

export interface HonoClientConstructor {
  new <T extends HonoApplication = HonoApplication>(
    serviceName: string,
    options?: HonoClientOptions
  ): HonoRPCClient<T>;
}

/**
 * Creates Hono's RPC client using the URL injected by a HonoHTTPService
 * dependency.
 */
function createHonoClient<T extends HonoApplication = HonoApplication>(
  serviceName: string,
  options: HonoClientOptions = {}
) {
  const { environment, ...clientOptions } = options;
  return hc<T>(
    resolveHonoServiceUrl(serviceName, environment),
    clientOptions
  );
}

export const HonoClient =
  createHonoClient as unknown as HonoClientConstructor;

export function resolveHonoServiceUrl(
  serviceName: string,
  environment?: Record<string, string | undefined>
) {
  const variableName = honoServiceUrlEnvironmentVariable(serviceName);
  const value =
    environment?.[variableName] ??
    getRuntimeEnvironment()?.[variableName] ??
    getProcessEnvironment()?.[variableName];

  if (value == null || value.trim().length === 0) {
    throw new Error(
      `Hono service "${serviceName}" is not configured: ` +
      `${variableName} must be present in the SAWS environment`
    );
  }

  return value.replace(/\/+$/, "");
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

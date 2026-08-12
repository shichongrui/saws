import { Queue, type ConnectionOptions, type Job, type JobsOptions } from "bullmq";

export type JobName<Jobs> = Jobs extends { name: infer Name extends string } ? Name : never;
export type JobData<Jobs, Name extends JobName<Jobs>> =
  Extract<Jobs, { name: Name }> extends {
    data: infer Data;
  }
    ? Data
    : never;

export interface BullMQClientOptions {
  /** Explicit queue name. Usually unnecessary because SAWS injects it for the worker service. */
  queue?: string;
  /** Explicit environment source for application adapters. */
  environment?: Record<string, string | undefined>;
  /** Explicit BullMQ connection options. Overrides the injected Redis URL. */
  connection?: ConnectionOptions;
}

export class BullMQClient<Jobs extends { name: string; data: unknown }> {
  readonly queue: Queue;

  constructor(serviceName: string, options: BullMQClientOptions = {}) {
    const { queue, environment, connection } = options;
    this.queue = new Queue(queue ?? resolveBullMQServiceQueueName(serviceName, environment), {
      connection: connection ?? { url: resolveBullMQServiceRedisUrl(serviceName, environment) },
    });
  }

  enqueue<Name extends JobName<Jobs>>(
    name: Name,
    data: JobData<Jobs, Name>,
    options?: JobsOptions,
  ): Promise<Job<JobData<Jobs, Name>>> {
    return this.queue.add(name, data, options);
  }

  close() {
    return this.queue.close();
  }

  disconnect() {
    return this.queue.disconnect();
  }
}

export function resolveBullMQServiceRedisUrl(
  serviceName: string,
  environment?: Record<string, string | undefined>,
) {
  const variableName = bullMQServiceRedisUrlEnvironmentVariable(serviceName);
  const value =
    environment?.[variableName] ??
    getRuntimeEnvironment()?.[variableName] ??
    getProcessEnvironment()?.[variableName];
  if (value == null || value.trim().length === 0) {
    throw new Error(
      `BullMQ service "${serviceName}" is not configured: ` +
        `${variableName} must be present in the SAWS environment`,
    );
  }
  return value;
}

export function resolveBullMQServiceQueueName(
  serviceName: string,
  environment?: Record<string, string | undefined>,
) {
  const variableName = bullMQServiceQueueNameEnvironmentVariable(serviceName);
  const value =
    environment?.[variableName] ??
    getRuntimeEnvironment()?.[variableName] ??
    getProcessEnvironment()?.[variableName];
  if (value == null || value.trim().length === 0) {
    throw new Error(
      `BullMQ service "${serviceName}" is not configured: ` +
        `${variableName} must be present in the SAWS environment`,
    );
  }
  return value;
}

export function bullMQServiceRedisUrlEnvironmentVariable(serviceName: string) {
  return `${serviceName.replace(/[^a-zA-Z\d]/g, "_").toUpperCase()}_REDIS_URL`;
}

export function bullMQServiceQueueNameEnvironmentVariable(serviceName: string) {
  return `${serviceName.replace(/[^a-zA-Z\d]/g, "_").toUpperCase()}_QUEUE_NAME`;
}

function getRuntimeEnvironment() {
  return (globalThis as typeof globalThis & { ENV?: Record<string, string | undefined> }).ENV;
}

function getProcessEnvironment() {
  return (
    globalThis as typeof globalThis & {
      process?: { env?: Record<string, string | undefined> };
    }
  ).process?.env;
}

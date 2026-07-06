import {
  FlowProducer,
  Queue,
  type Job,
  type JobNode,
  type JobsOptions,
} from "bullmq";
import {
  buildFlowTree,
  withDefaultJobOptions,
  type BullMQJobRegistry,
  type FlowEnqueueOptions,
} from "./utils.js";
import {
  resolveBullMQConnection,
  resolveBullMQQueueName,
  type BullMQClientEnvironment,
} from "./environment.js";

export type { BullMQClientEnvironment } from "./environment.js";

/** Structural registry shape every BullMQJobRegistry satisfies. */
export type BullMQClientRegistry = Record<string, { data: any; result: any }>;

export interface BullMQClientOptions extends BullMQClientEnvironment {}

/**
 * A type-safe BullMQ queue client. It resolves the Redis URL and queue name
 * that a BullMQWorkerService dependency injected into the SAWS environment, then
 * enqueues jobs whose names and payloads are checked against the service's
 * exported `BullMQJobRegistry`.
 *
 * @example
 * import { BullMQClient } from "@saws/bullmq";
 * import type { JobRegistry } from "./workers/emails/src/jobs/index.js";
 *
 * const client = new BullMQClient<JobRegistry>("email-worker");
 * await client.enqueue("send-email", { to: "a@b.com" }, { attempts: 3 });
 */
export class BullMQClient<Registry extends BullMQClientRegistry> {
  protected readonly queue: Queue;
  protected readonly flowProducer: FlowProducer;

  constructor(serviceName: string, options: BullMQClientOptions = {}) {
    const queueName = resolveBullMQQueueName(serviceName, options.environment);
    const connection = resolveBullMQConnection(serviceName, options.environment);
    this.queue = new Queue(queueName, { connection });
    this.flowProducer = new FlowProducer({ connection });
  }

  /** Adds a single job to the queue, checking name and data against Registry. */
  async enqueue<Name extends keyof Registry & string>(
    name: Name,
    data: Registry[Name]["data"],
    options?: JobsOptions,
  ): Promise<Job<Registry[Name]["data"], Registry[Name]["result"]>> {
    return this.queue.add(name, data, withDefaultJobOptions(options));
  }

  /**
   * Enqueues a sequential flow. The first name receives `data`; each later name
   * consumes the previous job's result. The last name is the flow root.
   */
  async enqueueFlow<
    Names extends readonly [
      keyof Registry & string,
      ...Array<keyof Registry & string>,
    ],
  >(
    names: Names,
    data: Registry[Names[0]]["data"],
    options?: JobsOptions | FlowEnqueueOptions,
  ): Promise<JobNode> {
    const { flow } = buildFlowTree(this.queue.name, names, data, options);
    return this.flowProducer.add(flow);
  }

  /** The underlying BullMQ queue. */
  getQueue(): Queue {
    return this.queue;
  }

  async close(): Promise<void> {
    await this.queue.close();
    await this.flowProducer.close();
  }

  async disconnect(): Promise<void> {
    await this.queue.disconnect();
    await this.flowProducer.disconnect();
  }
}

export type { BullMQJobRegistry } from "./utils.js";

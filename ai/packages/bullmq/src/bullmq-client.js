import { FlowProducer, Queue, } from "bullmq";
import { buildFlowTree, withDefaultJobOptions, } from "./utils.js";
import { resolveBullMQConnection, resolveBullMQQueueName, } from "./environment.js";
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
export class BullMQClient {
    queue;
    flowProducer;
    constructor(serviceName, options = {}) {
        const queueName = resolveBullMQQueueName(serviceName, options.environment);
        const connection = resolveBullMQConnection(serviceName, options.environment);
        this.queue = new Queue(queueName, { connection });
        this.flowProducer = new FlowProducer({ connection });
    }
    /** Adds a single job to the queue, checking name and data against Registry. */
    async enqueue(name, data, options) {
        return this.queue.add(name, data, withDefaultJobOptions(options));
    }
    /**
     * Enqueues a sequential flow. The first name receives `data`; each later name
     * consumes the previous job's result. The last name is the flow root.
     */
    async enqueueFlow(names, data, options) {
        const { flow } = buildFlowTree(this.queue.name, names, data, options);
        return this.flowProducer.add(flow);
    }
    /** The underlying BullMQ queue. */
    getQueue() {
        return this.queue;
    }
    async close() {
        await this.queue.close();
        await this.flowProducer.close();
    }
    async disconnect() {
        await this.queue.disconnect();
        await this.flowProducer.disconnect();
    }
}

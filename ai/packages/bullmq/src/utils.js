import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import { fileURLToPath } from "node:url";
import * as path from "node:path";
import { FlowProducer, Queue, Worker, UnrecoverableError, } from "bullmq";
const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;
const FLOW_DATA_MARKER = "__sawsFlow";
export function getRedisConnection() {
    const redisUrl = process.env.REDIS_URL;
    return { url: redisUrl };
}
export const getPrefixedQueueName = (baseName) => {
    const prefix = process.env.QUEUE_NAME_PREFIX;
    return prefix ? `${prefix}-${baseName}` : baseName;
};
export const createQueue = (baseName) => new Queue(getPrefixedQueueName(baseName), {
    connection: getRedisConnection(),
});
export const createFlowProducer = () => new FlowProducer({
    connection: getRedisConnection(),
});
export function createSandboxedWorker(queueName, filePath, options = {}) {
    const worker = new Worker(queueName, filePath, {
        connection: getRedisConnection(),
        ...options,
    });
    attachWorkerDebugLogging(worker, queueName);
    worker.on("error", errorHandler(queueName));
    worker.on("failed", reportPermanentFailure(queueName));
    return worker;
}
export const createWorker = (queueName, jobMapping, options = {}) => {
    const worker = new Worker(queueName, createProcessor(jobMapping), {
        connection: getRedisConnection(),
        ...options,
    });
    attachWorkerDebugLogging(worker, queueName);
    worker.on("error", errorHandler(queueName));
    worker.on("failed", reportPermanentFailure(queueName));
    return worker;
};
const attachWorkerDebugLogging = (worker, queueName) => {
    worker.on("active", (job) => {
        console.log(`[bullmq] active queue=${queueName} jobId=${job.id ?? "unknown"} name=${job.name} attemptsMade=${job.attemptsMade} data=${safeStringify(job.data)}`);
    });
    worker.on("completed", (job, result) => {
        console.log(`[bullmq] completed queue=${queueName} jobId=${job.id ?? "unknown"} name=${job.name} result=${safeStringify(result)}`);
    });
    worker.on("failed", (job, error) => {
        console.error(`[bullmq] failed queue=${queueName} jobId=${job?.id ?? "unknown"} name=${job?.name ?? "unknown"} attemptsMade=${job?.attemptsMade ?? "unknown"} error=${formatError(error)}`);
    });
};
const errorHandler = (queueName) => (err) => {
    console.error(`[bullmq] worker-error queue=${queueName} error=${formatError(err)}`);
};
const reportPermanentFailure = (queueName) => (job, error) => {
    if (job &&
        (isFinalAttempt(job) ||
            error.name === "UnrecoverableError" ||
            error instanceof UnrecoverableError)) {
        console.error(`[bullmq] permanent-failure queue=${queueName} jobId=${job.id ?? "unknown"} name=${job.name} attemptsMade=${job.attemptsMade} error=${formatError(error)}`);
    }
};
const isFinalAttempt = (job) => job.attemptsMade >= (job.opts.attempts ?? 0);
export const createProcessor = (jobMapping) => {
    return async (job, token) => {
        job.token = token;
        console.log(`[bullmq] dispatch queue=${job.queueName} jobId=${job.id ?? "unknown"} name=${job.name} tokenPresent=${token != null} data=${safeStringify(job.data)}`);
        const JobClass = jobMapping[job.name];
        if (JobClass == null) {
            throw new UnrecoverableError(`${job.name} can not be handled by this worker`);
        }
        const data = await resolveJobData(job);
        return new JobClass(data, job).run();
    };
};
export class BackgroundJob {
    data;
    job;
    constructor(data, job) {
        this.data = data;
        this.job = job;
    }
    log(logLine) {
        this.job == null ? console.log(logLine) : this.job.log(logLine);
    }
    debug(message, details) {
        const prefix = `[bullmq] name=${this.name} queue=${this.queue?.name ?? "unknown"} jobId=${this.job?.id ?? "unassigned"}`;
        const detailSuffix = details === undefined ? "" : ` details=${safeStringify(details)}`;
        this.log(`${prefix} ${message}${detailSuffix}`);
    }
    async enqueue(options) {
        if (this.name === "background-job") {
            throw new UnrecoverableError('The job name must be set to something other than "background-job"');
        }
        if (this.queue == null) {
            throw new UnrecoverableError("The queue must be set on the inheriting class");
        }
        this.job = await this.queue.add(this.name, this.data, withDefaultJobOptions(options));
        this.debug("enqueued", {
            data: this.data,
            options,
            attempts: this.job.opts.attempts ?? 0,
            delay: this.job.delay,
        });
        return this.job;
    }
    async retry() {
        if (this.job == null) {
            throw new Error("Can not retry without a job");
        }
        return this.job.retry();
    }
    async remove() {
        if (this.job == null) {
            throw new Error("Can not remove without a job");
        }
        return this.job.remove();
    }
}
/**
 * A sequential BullMQ flow built from an ordered tuple of job constructors.
 *
 * The first job in the tuple receives the enqueued data; each subsequent job
 * receives the result of the job that runs before it. The last job is the flow
 * root.
 */
export class Flow {
    jobs;
    flowProducer;
    constructor(jobs, flowProducer = createFlowProducer()) {
        if (jobs.length === 0) {
            throw new UnrecoverableError("A flow must include at least one job");
        }
        this.jobs = jobs;
        this.flowProducer = flowProducer;
    }
    async enqueue(data, options) {
        const flowOptions = normalizeFlowEnqueueOptions(options);
        const flowId = flowOptions.flowId ?? randomUUID();
        const root = this.createNode(this.jobs.length - 1, data, flowId, flowOptions);
        return this.flowProducer.add(root);
    }
    async close() {
        return this.flowProducer.close();
    }
    async disconnect() {
        return this.flowProducer.disconnect();
    }
    createNode(index, data, flowId, options) {
        const JobClass = this.jobs[index];
        const job = new JobClass(index === 0 ? data : createFlowWrappedJobData(flowId, index));
        if (job.name === "background-job") {
            throw new UnrecoverableError('The job name must be set to something other than "background-job"');
        }
        if (job.queue == null) {
            throw new UnrecoverableError("The queue must be set on every flow job class");
        }
        const node = {
            name: job.name,
            queueName: job.queue.name,
            data: job.data,
            opts: withDefaultJobOptions(getFlowJobOptions(options, index)),
        };
        if (index > 0) {
            node.children = [this.createNode(index - 1, data, flowId, options)];
        }
        return node;
    }
}
/**
 * Builds a BullMQ flow tree from job names for a single queue. The first name
 * receives `data`; each later name receives the result of the previous job via
 * BullMQ's child-result mechanism. The last name is the flow root. Used by the
 * BullMQClient to enqueue flows without the worker-side job constructors.
 */
export function buildFlowTree(queueName, names, data, options) {
    if (names.length === 0) {
        throw new UnrecoverableError("A flow must include at least one job");
    }
    const normalized = normalizeFlowEnqueueOptions(options);
    const flowId = normalized.flowId ?? randomUUID();
    const flow = buildFlowNode(queueName, names, names.length - 1, data, flowId, normalized);
    return { flow, flowId };
}
function buildFlowNode(queueName, names, index, data, flowId, options) {
    const node = {
        name: names[index],
        queueName,
        data: index === 0 ? data : createFlowWrappedJobData(flowId, index),
        opts: withDefaultJobOptions(getFlowJobOptions(options, index)),
    };
    if (index > 0) {
        node.children = [
            buildFlowNode(queueName, names, index - 1, data, flowId, options),
        ];
    }
    return node;
}
export function getProcessorPath(from) {
    const filename = fileURLToPath(from);
    const dirname = path.dirname(filename);
    const extension = extname(filename).slice(1) ||
        process.env.PROCESSOR_EXTENSION ||
        "js";
    return path.resolve(dirname, `./processor.${extension}`);
}
/** Applies the shared retention/retry defaults SAWS uses for every job. */
export function withDefaultJobOptions(options) {
    return {
        ...options,
        delay: options?.delay ?? 0,
        keepLogs: 1000,
        removeOnComplete: {
            age: THIRTY_DAYS_SECONDS,
        },
        removeOnFail: {
            age: THIRTY_DAYS_SECONDS,
        },
    };
}
function normalizeFlowEnqueueOptions(options) {
    if (options == null) {
        return {};
    }
    if (isFlowEnqueueOptions(options)) {
        return {
            jobs: options.jobs,
            flowId: options.flowId,
        };
    }
    return {
        jobs: options,
    };
}
function getFlowJobOptions(options, index) {
    const jobs = options.jobs;
    if (isJobsOptionsArray(jobs)) {
        return jobs[index];
    }
    return jobs;
}
function isFlowEnqueueOptions(options) {
    return "jobs" in options || "flowId" in options;
}
function isJobsOptionsArray(jobs) {
    return Array.isArray(jobs);
}
function createFlowWrappedJobData(flowId, step) {
    return {
        [FLOW_DATA_MARKER]: {
            version: 1,
            flowId,
            step,
        },
    };
}
async function resolveJobData(job) {
    if (!isFlowWrappedJobData(job.data)) {
        return job.data;
    }
    const childResults = await job.getChildrenValues();
    const resultValues = Object.values(childResults);
    if (resultValues.length !== 1) {
        throw new UnrecoverableError(`Flow job ${job.name} expected exactly one completed child result, received ${resultValues.length}`);
    }
    return resultValues[0];
}
function isFlowWrappedJobData(data) {
    return (typeof data === "object" &&
        data != null &&
        FLOW_DATA_MARKER in data &&
        typeof data[FLOW_DATA_MARKER] === "object" &&
        data[FLOW_DATA_MARKER] != null);
}
function safeStringify(value) {
    try {
        const serialized = JSON.stringify(value);
        return serialized ?? String(value);
    }
    catch {
        return String(value);
    }
}
function formatError(error) {
    if (error instanceof Error) {
        return safeStringify({
            name: error.name,
            message: error.message,
            stack: error.stack,
        });
    }
    return safeStringify(error);
}

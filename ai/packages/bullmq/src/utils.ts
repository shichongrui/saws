import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import { fileURLToPath } from "node:url";
import * as path from "node:path";
import {
  FlowProducer,
  Job,
  type FlowJob,
  type JobNode,
  type JobsOptions,
  Queue,
  Worker,
  type ConnectionOptions,
  type WorkerOptions,
  UnrecoverableError,
} from "bullmq";

const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;
const FLOW_DATA_MARKER = "__sawsFlow";

export type BackgroundJobConstructor<
  DataType = any,
  ReturnType = any,
  JobDataType = DataType,
> = new (data: DataType, job?: Job<JobDataType>) => BackgroundJob<
  DataType,
  ReturnType,
  JobDataType
>;
export type AnyBackgroundJobConstructor = BackgroundJobConstructor<any, any, any>;

/** Extracts the data payload type from a BackgroundJob constructor. */
export type JobDataType<J extends AnyBackgroundJobConstructor> =
  ConstructorParameters<J>[0];

/** Extracts the result type from a BackgroundJob constructor. */
export type JobResultType<J extends AnyBackgroundJobConstructor> =
  InstanceType<J> extends BackgroundJob<any, infer R, any> ? R : never;

/**
 * Maps job names to their data and result types, derived from a record of
 * BackgroundJob constructors. Pass `typeof jobs` to build the registry type a
 * BullMQClient is parameterized over.
 *
 * @example
 * export const jobs = { "send-email": SendEmailJob } satisfies Record<string, BackgroundJobConstructor>;
 * export type JobRegistry = BullMQJobRegistry<typeof jobs>;
 */
export type BullMQJobRegistry<
  Jobs extends Record<string, AnyBackgroundJobConstructor>,
> = {
  [K in keyof Jobs & string]: {
    data: JobDataType<Jobs[K]>;
    result: JobResultType<Jobs[K]>;
  };
};

type FlowInputType<Jobs extends readonly AnyBackgroundJobConstructor[]> =
  Jobs extends readonly [
    infer FirstJob extends AnyBackgroundJobConstructor,
    ...AnyBackgroundJobConstructor[],
  ]
    ? ConstructorParameters<FirstJob>[0]
    : never;

type FlowWrappedJobData = {
  [FLOW_DATA_MARKER]: {
    version: 1;
    flowId: string;
    step: number;
  };
};

export type FlowEnqueueOptions = {
  jobs?: JobsOptions | readonly (JobsOptions | undefined)[];
  flowId?: string;
};

export function getRedisConnection(): ConnectionOptions {
  const redisUrl = process.env.REDIS_URL;
  return { url: redisUrl };
}

export const getPrefixedQueueName = (baseName: string) => {
  const prefix = process.env.QUEUE_NAME_PREFIX;
  return prefix ? `${prefix}-${baseName}` : baseName;
};

export const createQueue = (baseName: string) =>
  new Queue(getPrefixedQueueName(baseName), {
    connection: getRedisConnection(),
  });

export const createFlowProducer = () =>
  new FlowProducer({
    connection: getRedisConnection(),
  });

export function createSandboxedWorker(
  queueName: string,
  filePath: string | URL,
  options: Partial<WorkerOptions> = {},
) {
  const worker = new Worker(queueName, filePath, {
    connection: getRedisConnection(),
    ...options,
  });
  attachWorkerDebugLogging(worker, queueName);
  worker.on("error", errorHandler(queueName));
  worker.on("failed", reportPermanentFailure(queueName));
  return worker;
}

export const createWorker = (
  queueName: string,
  jobMapping: Record<string, new (data: any, job?: Job) => BackgroundJob>,
  options: Partial<WorkerOptions> = {},
) => {
  const worker = new Worker(queueName, createProcessor(jobMapping), {
    connection: getRedisConnection(),
    ...options,
  });
  attachWorkerDebugLogging(worker, queueName);
  worker.on("error", errorHandler(queueName));
  worker.on("failed", reportPermanentFailure(queueName));
  return worker;
};

const attachWorkerDebugLogging = (worker: Worker, queueName: string) => {
  worker.on("active", (job: Job) => {
    console.log(
      `[bullmq] active queue=${queueName} jobId=${job.id ?? "unknown"} name=${job.name} attemptsMade=${job.attemptsMade} data=${safeStringify(job.data)}`,
    );
  });

  worker.on("completed", (job: Job, result: unknown) => {
    console.log(
      `[bullmq] completed queue=${queueName} jobId=${job.id ?? "unknown"} name=${job.name} result=${safeStringify(result)}`,
    );
  });

  worker.on("failed", (job: Job | undefined, error: Error) => {
    console.error(
      `[bullmq] failed queue=${queueName} jobId=${job?.id ?? "unknown"} name=${job?.name ?? "unknown"} attemptsMade=${job?.attemptsMade ?? "unknown"} error=${formatError(error)}`,
    );
  });
};

const errorHandler = (queueName: string) => (err: Error) => {
  console.error(`[bullmq] worker-error queue=${queueName} error=${formatError(err)}`);
};

const reportPermanentFailure =
  (queueName: string) => (job: Job | undefined, error: Error) => {
    if (
      job &&
      (isFinalAttempt(job) ||
        error.name === "UnrecoverableError" ||
        error instanceof UnrecoverableError)
    ) {
      console.error(
        `[bullmq] permanent-failure queue=${queueName} jobId=${job.id ?? "unknown"} name=${job.name} attemptsMade=${job.attemptsMade} error=${formatError(error)}`,
      );
    }
  };

const isFinalAttempt = (job: Job) =>
  job.attemptsMade >= (job.opts.attempts ?? 0);

export const createProcessor = (
  jobMapping: Record<string, BackgroundJobConstructor>,
) => {
  return async (job: Job, token?: string) => {
    job.token = token;
    console.log(
      `[bullmq] dispatch queue=${job.queueName} jobId=${job.id ?? "unknown"} name=${job.name} tokenPresent=${token != null} data=${safeStringify(job.data)}`,
    );
    const JobClass = jobMapping[job.name];
    if (JobClass == null) {
      throw new UnrecoverableError(
        `${job.name} can not be handled by this worker`,
      );
    }
    const data = await resolveJobData(job);
    return new JobClass(data, job).run();
  };
};

export abstract class BackgroundJob<
  DataType = any,
  ReturnType = any,
  JobDataType = DataType,
> {
  abstract name: string;
  abstract queue: Queue;
  data: DataType;
  job?: Job<JobDataType>;

  constructor(data: DataType, job?: Job<JobDataType>) {
    this.data = data;
    this.job = job;
  }

  abstract run(): Promise<ReturnType>;

  log(logLine: string) {
    this.job == null ? console.log(logLine) : this.job.log(logLine);
  }

  protected debug(message: string, details?: unknown) {
    const prefix =
      `[bullmq] name=${this.name} queue=${this.queue?.name ?? "unknown"} jobId=${this.job?.id ?? "unassigned"}`;
    const detailSuffix =
      details === undefined ? "" : ` details=${safeStringify(details)}`;
    this.log(`${prefix} ${message}${detailSuffix}`);
  }

  async enqueue(options?: JobsOptions) {
    if (this.name === "background-job") {
      throw new UnrecoverableError(
        'The job name must be set to something other than "background-job"',
      );
    }

    if (this.queue == null) {
      throw new UnrecoverableError(
        "The queue must be set on the inheriting class",
      );
    }

    this.job = await this.queue.add(
      this.name,
      this.data,
      withDefaultJobOptions(options),
    );
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
export class Flow<
  const Jobs extends readonly [
    AnyBackgroundJobConstructor,
    ...AnyBackgroundJobConstructor[],
  ],
> {
  private readonly jobs: Jobs;
  private readonly flowProducer: FlowProducer;

  constructor(jobs: Jobs, flowProducer = createFlowProducer()) {
    if (jobs.length === 0) {
      throw new UnrecoverableError("A flow must include at least one job");
    }

    this.jobs = jobs;
    this.flowProducer = flowProducer;
  }

  async enqueue(
    data: FlowInputType<Jobs>,
    options?: JobsOptions | FlowEnqueueOptions,
  ): Promise<JobNode> {
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

  private createNode(
    index: number,
    data: FlowInputType<Jobs>,
    flowId: string,
    options: NormalizedFlowEnqueueOptions,
  ): FlowJob {
    const JobClass = this.jobs[index];
    const job = new JobClass(
      index === 0 ? data : createFlowWrappedJobData(flowId, index),
    );

    if (job.name === "background-job") {
      throw new UnrecoverableError(
        'The job name must be set to something other than "background-job"',
      );
    }

    if (job.queue == null) {
      throw new UnrecoverableError(
        "The queue must be set on every flow job class",
      );
    }

    const node: FlowJob = {
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
export function buildFlowTree(
  queueName: string,
  names: readonly string[],
  data: unknown,
  options?: JobsOptions | FlowEnqueueOptions,
): { flow: FlowJob; flowId: string } {
  if (names.length === 0) {
    throw new UnrecoverableError("A flow must include at least one job");
  }

  const normalized = normalizeFlowEnqueueOptions(options);
  const flowId = normalized.flowId ?? randomUUID();
  const flow = buildFlowNode(queueName, names, names.length - 1, data, flowId, normalized);
  return { flow, flowId };
}

function buildFlowNode(
  queueName: string,
  names: readonly string[],
  index: number,
  data: unknown,
  flowId: string,
  options: NormalizedFlowEnqueueOptions,
): FlowJob {
  const node: FlowJob = {
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

export function getProcessorPath(from: string | URL) {
  const filename = fileURLToPath(from);
  const dirname = path.dirname(filename);
  const extension =
    extname(filename).slice(1) ||
    process.env.PROCESSOR_EXTENSION ||
    "js";
  return path.resolve(dirname, `./processor.${extension}`);
}

/** Applies the shared retention/retry defaults SAWS uses for every job. */
export function withDefaultJobOptions(options?: JobsOptions): JobsOptions {
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

type NormalizedFlowEnqueueOptions = {
  jobs?: JobsOptions | readonly (JobsOptions | undefined)[];
  flowId?: string;
};

function normalizeFlowEnqueueOptions(
  options?: JobsOptions | FlowEnqueueOptions,
): NormalizedFlowEnqueueOptions {
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

function getFlowJobOptions(
  options: NormalizedFlowEnqueueOptions,
  index: number,
): JobsOptions | undefined {
  const jobs = options.jobs;
  if (isJobsOptionsArray(jobs)) {
    return jobs[index];
  }

  return jobs;
}

function isFlowEnqueueOptions(
  options: JobsOptions | FlowEnqueueOptions,
): options is FlowEnqueueOptions {
  return "jobs" in options || "flowId" in options;
}

function isJobsOptionsArray(
  jobs: NormalizedFlowEnqueueOptions["jobs"],
): jobs is readonly (JobsOptions | undefined)[] {
  return Array.isArray(jobs);
}

function createFlowWrappedJobData(flowId: string, step: number): FlowWrappedJobData {
  return {
    [FLOW_DATA_MARKER]: {
      version: 1,
      flowId,
      step,
    },
  };
}

async function resolveJobData(job: Job): Promise<unknown> {
  if (!isFlowWrappedJobData(job.data)) {
    return job.data;
  }

  const childResults = await job.getChildrenValues();
  const resultValues = Object.values(childResults);

  if (resultValues.length !== 1) {
    throw new UnrecoverableError(
      `Flow job ${job.name} expected exactly one completed child result, received ${resultValues.length}`,
    );
  }

  return resultValues[0];
}

function isFlowWrappedJobData(data: unknown): data is FlowWrappedJobData {
  return (
    typeof data === "object" &&
    data != null &&
    FLOW_DATA_MARKER in data &&
    typeof data[FLOW_DATA_MARKER] === "object" &&
    data[FLOW_DATA_MARKER] != null
  );
}

function safeStringify(value: unknown): string {
  try {
    const serialized = JSON.stringify(value);
    return serialized ?? String(value);
  } catch {
    return String(value);
  }
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return safeStringify({
      name: error.name,
      message: error.message,
      stack: error.stack,
    });
  }

  return safeStringify(error);
}

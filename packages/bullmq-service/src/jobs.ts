import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  FlowProducer,
  Job,
  Queue,
  UnrecoverableError,
  Worker,
  type ConnectionOptions,
  type FlowJob,
  type JobNode,
  type JobsOptions,
  type WorkerOptions,
} from "bullmq";

const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;
const FLOW_DATA_MARKER = "__aiFlow";

export type BackgroundJobConstructor<
  DataType = any,
  ReturnType = any,
  JobDataType = DataType,
> = new (
  data: DataType,
  job?: Job<JobDataType>,
) => BackgroundJob<DataType, ReturnType, JobDataType>;
type AnyBackgroundJobConstructor = BackgroundJobConstructor<any, any, any>;
type FlowInputType<Jobs extends readonly AnyBackgroundJobConstructor[]> = Jobs extends readonly [
  infer FirstJob extends AnyBackgroundJobConstructor,
  ...AnyBackgroundJobConstructor[],
]
  ? ConstructorParameters<FirstJob>[0]
  : never;

/** A discriminated union used by BullMQClient for type-safe job enqueueing. */
export type JobsFromMapping<Mapping extends Record<string, AnyBackgroundJobConstructor>> = {
  [Name in keyof Mapping]: {
    name: Name;
    data: ConstructorParameters<Mapping[Name]>[0];
  };
}[keyof Mapping];

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
  return { url: process.env.REDIS_URL };
}

export const getPrefixedQueueName = (baseName: string) => {
  const prefix = process.env.QUEUE_NAME_PREFIX;
  return prefix ? `${prefix}-${baseName}` : baseName;
};

export const createQueue = (baseName: string) =>
  new Queue(getPrefixedQueueName(baseName), { connection: getRedisConnection() });

export const createFlowProducer = () => new FlowProducer({ connection: getRedisConnection() });

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
  jobMapping: Record<string, BackgroundJobConstructor>,
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
  worker.on("active", (job) => {
    console.log(
      `[jobs] active queue=${queueName} jobId=${job.id ?? "unknown"} name=${job.name} attemptsMade=${job.attemptsMade} data=${safeStringify(job.data)}`,
    );
  });
  worker.on("completed", (job, result) => {
    console.log(
      `[jobs] completed queue=${queueName} jobId=${job.id ?? "unknown"} name=${job.name} result=${safeStringify(result)}`,
    );
  });
  worker.on("failed", (job, error) => {
    console.error(
      `[jobs] failed queue=${queueName} jobId=${job?.id ?? "unknown"} name=${job?.name ?? "unknown"} attemptsMade=${job?.attemptsMade ?? "unknown"} error=${formatError(error)}`,
    );
  });
};

const errorHandler = (queueName: string) => (error: Error) => {
  console.error(`[jobs] worker-error queue=${queueName} error=${formatError(error)}`);
};

const reportPermanentFailure = (queueName: string) => (job: Job | undefined, error: Error) => {
  if (
    job &&
    (isFinalAttempt(job) ||
      error.name === "UnrecoverableError" ||
      error instanceof UnrecoverableError)
  ) {
    console.error(
      `[jobs] permanent-failure queue=${queueName} jobId=${job.id ?? "unknown"} name=${job.name} attemptsMade=${job.attemptsMade} error=${formatError(error)}`,
    );
  }
};

const isFinalAttempt = (job: Job) => job.attemptsMade >= (job.opts.attempts ?? 0);

export const createProcessor = (jobMapping: Record<string, BackgroundJobConstructor>) => {
  return async (job: Job, token?: string) => {
    job.token = token;
    console.log(
      `[jobs] dispatch queue=${job.queueName} jobId=${job.id ?? "unknown"} name=${job.name} tokenPresent=${token != null} data=${safeStringify(job.data)}`,
    );
    const JobClass = jobMapping[job.name];
    if (JobClass == null) {
      throw new UnrecoverableError(`${job.name} can not be handled by this worker`);
    }
    const data = await resolveJobData(job);
    return new JobClass(data, job).run();
  };
};

export abstract class BackgroundJob<DataType = any, ReturnType = any, JobDataType = DataType> {
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
    if (this.job == null) {
      console.log(logLine);
      return;
    }
    this.job.log(logLine);
  }

  protected debug(message: string, details?: unknown) {
    const prefix = `[jobs] name=${this.name} queue=${this.queue?.name ?? "unknown"} jobId=${this.job?.id ?? "unassigned"}`;
    const detailSuffix = details === undefined ? "" : ` details=${safeStringify(details)}`;
    this.log(`${prefix} ${message}${detailSuffix}`);
  }

  async enqueue(options?: JobsOptions) {
    if (this.name === "background-job") {
      throw new UnrecoverableError(
        'The job name must be set to something other than "background-job"',
      );
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
    if (this.job == null) throw new Error("Can not retry without a job");
    return this.job.retry();
  }

  async remove() {
    if (this.job == null) throw new Error("Can not remove without a job");
    return this.job.remove();
  }
}

export class Flow<
  const Jobs extends readonly [AnyBackgroundJobConstructor, ...AnyBackgroundJobConstructor[]],
> {
  private readonly jobs: Jobs;
  private readonly flowProducer: FlowProducer;

  constructor(jobs: Jobs, flowProducer = createFlowProducer()) {
    if (jobs.length === 0) throw new UnrecoverableError("A flow must include at least one job");
    this.jobs = jobs;
    this.flowProducer = flowProducer;
  }

  async enqueue(
    data: FlowInputType<Jobs>,
    options?: JobsOptions | FlowEnqueueOptions,
  ): Promise<JobNode> {
    const flowOptions = normalizeFlowEnqueueOptions(options);
    const flowId = flowOptions.flowId ?? randomUUID();
    return this.flowProducer.add(this.createNode(this.jobs.length - 1, data, flowId, flowOptions));
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
    const job = new JobClass(index === 0 ? data : createFlowWrappedJobData(flowId, index));
    if (job.name === "background-job") {
      throw new UnrecoverableError(
        'The job name must be set to something other than "background-job"',
      );
    }
    if (job.queue == null) {
      throw new UnrecoverableError("The queue must be set on every flow job class");
    }
    const node: FlowJob = {
      name: job.name,
      queueName: job.queue.name,
      data: job.data,
      opts: withDefaultJobOptions(getFlowJobOptions(options, index)),
    };
    if (index > 0) node.children = [this.createNode(index - 1, data, flowId, options)];
    return node;
  }
}

export function getProcessorPath(from: string | URL) {
  const filename = fileURLToPath(from);
  const dirname = path.dirname(filename);
  const extension = extname(filename).slice(1) || process.env.PROCESSOR_EXTENSION || "js";
  return path.resolve(dirname, `./processor.${extension}`);
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

type NormalizedFlowEnqueueOptions = {
  jobs?: JobsOptions | readonly (JobsOptions | undefined)[];
  flowId?: string;
};

function normalizeFlowEnqueueOptions(
  options?: JobsOptions | FlowEnqueueOptions,
): NormalizedFlowEnqueueOptions {
  if (options == null) return {};
  return isFlowEnqueueOptions(options)
    ? { jobs: options.jobs, flowId: options.flowId }
    : { jobs: options };
}

function getFlowJobOptions(
  options: NormalizedFlowEnqueueOptions,
  index: number,
): JobsOptions | undefined {
  return isJobsOptionsArray(options.jobs) ? options.jobs[index] : options.jobs;
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
  return { [FLOW_DATA_MARKER]: { version: 1, flowId, step } };
}

async function resolveJobData(job: Job): Promise<unknown> {
  if (!isFlowWrappedJobData(job.data)) return job.data;
  const resultValues = Object.values(await job.getChildrenValues());
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

function withDefaultJobOptions(options?: JobsOptions): JobsOptions {
  return {
    ...options,
    delay: options?.delay ?? 0,
    keepLogs: 1000,
    removeOnComplete: { age: THIRTY_DAYS_SECONDS },
    removeOnFail: { age: THIRTY_DAYS_SECONDS },
  };
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return safeStringify({ name: error.name, message: error.message, stack: error.stack });
  }
  return safeStringify(error);
}

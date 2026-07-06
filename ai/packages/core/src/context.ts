import type { ServiceDefinition } from "./service-definition.js";

export type StageName = "local" | string;

export interface RuntimeContextConfig {
  stage: StageName;
  rootDir?: string;
  env?: Record<string, string>;
  dryRun?: boolean;
  logSink?: RuntimeLogSink;
  currentServiceName?: string;
}

export interface RuntimeLogEntry {
  serviceName: string;
  stream: "stdout" | "stderr";
  chunk: string;
  timestamp: Date;
}

export type RuntimeLogSink = (entry: RuntimeLogEntry) => void;

export class RuntimeContext {
  readonly stage: StageName;
  readonly rootDir: string;
  readonly env: Record<string, string>;
  readonly dryRun: boolean;
  readonly logSink?: RuntimeLogSink;
  readonly currentServiceName?: string;

  constructor(config: RuntimeContextConfig) {
    assertValidStageName(config.stage);
    this.stage = config.stage;
    this.rootDir = config.rootDir ?? process.cwd();
    this.env = config.env ?? process.env as Record<string, string>;
    this.dryRun = config.dryRun ?? false;
    this.logSink = config.logSink;
    this.currentServiceName = config.currentServiceName;
  }

  writeLog(chunk: string, stream: "stdout" | "stderr" = "stdout") {
    this.logSink?.({
      serviceName: this.currentServiceName ?? "system",
      stream,
      chunk,
      timestamp: new Date(),
    });
  }
}

export class InitContext extends RuntimeContext {}
export class DevContext extends RuntimeContext {}
export class DeployContext extends RuntimeContext {}
export class ExitContext extends RuntimeContext {}

export function assertValidStageName(stage: string) {
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(stage)) {
    throw new Error(
      `Invalid stage "${stage}": stages must start with a lower-case letter or number and contain only lower-case letters, numbers, ".", "_", or "-"`
    );
  }
}

export interface DependencyEnvironment {
  service: ServiceDefinition;
  variables: Record<string, string>;
}

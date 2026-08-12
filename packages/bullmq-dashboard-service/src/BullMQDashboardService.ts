import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { ServiceDefinition } from "@saws/core";
import { BullMQService } from "@saws/bullmq-service";
import {
  DockerService,
  type DockerRunConfig,
  type DockerServiceConfig,
} from "@saws/docker-service";
import { RedisService } from "@saws/redis-service";

const DEFAULT_PORT = 3000;
const PACKAGE_DIRECTORY = path.resolve(import.meta.dirname, "..");
const DASHBOARD_ENTRYPOINT = path.join(import.meta.dirname, "run-dashboard.js");

export interface BullMQDashboardServiceConfig extends Omit<
  DockerServiceConfig,
  "image" | "dockerfile" | "buildContext" | "ports" | "command" | "healthCheck"
> {
  /** Redis instance containing the BullMQ queues displayed by the dashboard. */
  redis: RedisService;
  /** BullMQ worker services whose queues should appear in the dashboard. */
  bullMQServices: BullMQService[];
  /** Port the dashboard listens on. Defaults to PORT or 3000. */
  port?: number;
}

export class BullMQDashboardService extends DockerService {
  readonly redis: RedisService;
  readonly bullMQServices: BullMQService[];
  readonly port: number;
  protected override readonly serviceType = "bullmq-dashboard";
  private dashboardDevProcess?: ChildProcess;

  constructor(config: BullMQDashboardServiceConfig) {
    const port = config.port ?? Number(process.env["PORT"] ?? DEFAULT_PORT);

    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
      throw new Error(
        `BullMQ dashboard service "${config.name}" port must be an integer from 1 to 65535`,
      );
    }
    if (config.bullMQServices == null || config.bullMQServices.length === 0) {
      throw new Error(
        `BullMQ dashboard service "${config.name}" requires at least one BullMQ service`,
      );
    }
    const mismatchedService = config.bullMQServices.find(
      (service) => service.redis !== config.redis,
    );
    if (mismatchedService != null) {
      throw new Error(
        `BullMQ service "${mismatchedService.name}" must use the same Redis service as dashboard "${config.name}"`,
      );
    }

    const bullMQServices = [...new Set(config.bullMQServices)];

    super({
      ...config,
      dependencies: [...(config.dependencies ?? []), config.redis, ...bullMQServices],
      dockerfile: path.join(PACKAGE_DIRECTORY, "Dockerfile"),
      buildContext: PACKAGE_DIRECTORY,
      healthCheck: {
        command:
          "node -e \"fetch('http://localhost:' + process.env.PORT).then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))\"",
        interval: "5s",
        timeout: "2s",
        retries: 12,
        startPeriod: "5s",
      },
    });

    this.redis = config.redis;
    this.bullMQServices = bullMQServices;
    this.port = port;
  }

  override async dev() {
    await ServiceDefinition.prototype.dev.call(this);

    const environment = {
      ...(await this.getDependenciesEnvironmentVariables("local", "host")),
      ...(await this.getStageEnvironmentVariables("local")),
      ...(await this.getRuntimeEnvironment("local", "host")),
    };
    this.writeRuntimeLog(`Start BullMQ dashboard ${this.name} on port ${this.port}\n`);
    this.dashboardDevProcess = spawn(process.execPath, [DASHBOARD_ENTRYPOINT], {
      env: {
        ...process.env,
        ...environment,
        NODE_ENV: "development",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.observeDashboardDevProcess(this.dashboardDevProcess);
  }

  override exit() {
    super.exit();
    this.dashboardDevProcess?.kill();
    this.dashboardDevProcess = undefined;
  }

  protected override async getContainerEnvironment(stage: string): Promise<Record<string, string>> {
    return {
      ...(await super.getContainerEnvironment(stage)),
      ...(await this.getRuntimeEnvironment(stage, "container")),
    };
  }

  protected override async getDockerRunConfig(stage: string, deploy: boolean) {
    const config = await super.getDockerRunConfig(stage, deploy);

    return {
      ...config,
      ports: [`${this.port}:${this.port}`],
    } satisfies DockerRunConfig;
  }

  private async getRuntimeEnvironment(stage: string, target: "container" | "host") {
    return {
      PORT: String(this.port),
      REDIS_URL: (await this.redis.getConnectionInfo(stage, target)).url,
      QUEUE_NAMES: JSON.stringify([
        ...new Set(this.bullMQServices.map((service) => service.queue)),
      ]),
    };
  }

  private observeDashboardDevProcess(process: ChildProcess) {
    process.stdout?.on("data", (chunk: Buffer) => this.writeRuntimeLog(chunk.toString("utf8")));
    process.stderr?.on("data", (chunk: Buffer) =>
      this.writeRuntimeLog(chunk.toString("utf8"), "stderr"),
    );
    process.once("error", (error) => {
      this.writeRuntimeLog(`${error.stack ?? error.message}\n`, "stderr");
    });
    process.once("exit", (code, signal) => {
      if (this.dashboardDevProcess === process) this.dashboardDevProcess = undefined;
      if (code !== 0 && signal !== "SIGTERM" && signal !== "SIGINT") {
        this.writeRuntimeLog(
          `BullMQ dashboard exited with code ${code ?? "unknown"}${signal == null ? "" : ` (${signal})`}\n`,
          "stderr",
        );
      }
    });
  }
}

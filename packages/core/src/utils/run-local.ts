import { spawn } from "node:child_process";
import type { RuntimeLogSink } from "../ServiceDefinition.js";

export async function runLocal(
  command: string,
  options: {
    dryRun?: boolean;
    input?: string;
    cwd?: string;
    logSink?: RuntimeLogSink;
    serviceName?: string;
    signal?: AbortSignal;
  } = {},
) {
  if (options.dryRun) {
    if (options.logSink == null) {
      console.log(`[dry-run:local] ${command}`);
    } else {
      options.logSink({
        serviceName: options.serviceName ?? "system",
        stream: "stdout",
        chunk: `[dry-run:local] ${command}\n`,
        timestamp: new Date(),
      });
    }
    return;
  }

  await new Promise<void>((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(new Error(`local command aborted: ${command}`));
      return;
    }

    const captureOutput = options.logSink != null;
    const serviceName = options.serviceName ?? "system";
    const child = spawn(command, {
      cwd: options.cwd,
      shell: true,
      detached: true,
      stdio: [
        options.input == null ? "ignore" : "pipe",
        captureOutput ? "pipe" : "inherit",
        captureOutput ? "pipe" : "inherit",
      ],
    });
    let aborted = false;

    const abort = () => {
      aborted = true;
      if (child.pid == null) return;

      try {
        process.kill(-child.pid, "SIGTERM");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
          options.logSink?.({
            serviceName: options.serviceName ?? "system",
            stream: "stderr",
            chunk: `Failed to stop local command: ${(error as Error).message}\n`,
            timestamp: new Date(),
          });
        }
      }
    };

    options.signal?.addEventListener("abort", abort, { once: true });

    if (options.input != null) {
      child.stdin?.end(options.input);
    }
    child.stdout?.on("data", (chunk: Buffer) => {
      options.logSink?.({
        serviceName,
        stream: "stdout",
        chunk: chunk.toString("utf8"),
        timestamp: new Date(),
      });
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      options.logSink?.({
        serviceName,
        stream: "stderr",
        chunk: chunk.toString("utf8"),
        timestamp: new Date(),
      });
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      options.signal?.removeEventListener("abort", abort);
      if (aborted) {
        reject(new Error(`local command aborted: ${command}`));
        return;
      }
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`local command exited with code ${code}: ${command}`));
    });
  });
}

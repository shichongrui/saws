import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ServiceDefinition } from "@saws/core";
import { shellQuote } from "@saws/core/utils/shell-quote";

export const DEV_READY_LINE = "SAWS_DEV_STARTED";

export function collectDevServices(root: ServiceDefinition) {
  const visiting = new Set<ServiceDefinition>();
  const visited = new Set<ServiceDefinition>();
  const names = new Set<string>();
  const services: ServiceDefinition[] = [];
  const visit = (service: ServiceDefinition) => {
    if (visiting.has(service)) throw new Error(`Cyclic service dependency at "${service.name}"`);
    if (visited.has(service)) return;
    if (!service.name.trim() || names.has(service.name)) {
      throw new Error(`Development requires unique, nonempty service names: "${service.name}"`);
    }
    names.add(service.name);
    visiting.add(service);
    service.dependencies.forEach(visit);
    visiting.delete(service);
    visited.add(service);
    services.push(service);
  };
  visit(root);
  return services;
}

export async function writeProcessComposeConfig(root: ServiceDefinition, configPath: string) {
  const services = collectDevServices(root);
  const directory = path.resolve(".saws", "dev");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const worker = fileURLToPath(new URL("./worker.js", import.meta.url));
  const command = (service: ServiceDefinition, hook?: number) =>
    [
      "exec",
      process.execPath,
      ...process.execArgv,
      worker,
      path.resolve(configPath),
      service.name,
      ...(hook == null ? [] : [String(hook)]),
    ]
      .map((argument, index) => (index === 0 ? argument : shellQuote(argument)))
      .join(" ");

  const processes: Record<string, unknown> = Object.create(null);
  const usedNames = new Set(services.map((service) => service.name));
  for (const [index, service] of services.entries()) {
    const dependencies: Record<string, { condition: string }> = Object.create(null);
    for (const dependency of service.dependencies) {
      dependencies[dependency.name] = { condition: "process_log_ready" };
    }
    // Preserve SAWS' dependency-first, serial setup, including shared secret/output writes.
    const previous = services[index - 1];
    if (previous != null) dependencies[previous.name] = { condition: "process_log_ready" };
    const base = {
      working_dir: process.cwd(),
      depends_on: dependencies,
      shutdown: { signal: 15, timeout_seconds: 10 },
      availability: { restart: "no" },
    };
    processes[service.name] = {
      ...base,
      command: command(service),
      ready_log_line: DEV_READY_LINE,
    };
    for (const [hookIndex] of service.onDev.entries()) {
      let hookName = `${service.name}: onDev ${hookIndex + 1}`;
      while (usedNames.has(hookName)) hookName += " (hook)";
      usedNames.add(hookName);
      processes[hookName] = {
        ...base,
        command: command(service, hookIndex),
      };
    }
  }
  const outputPath = path.join(directory, "process-compose.yaml");
  // JSON is valid YAML; keep commands quoted without another serialization dependency.
  await writeFile(
    outputPath,
    JSON.stringify(
      {
        version: "0.5",
        ordered_shutdown: true,
        environment: ["NODE_ENV=development", "STAGE=local", "AWS_REGION=us-west-2"],
        processes,
      },
      null,
      2,
    ) + "\n",
    { mode: 0o600 },
  );
  return outputPath;
}

export async function launchProcessCompose(configPath: string, tui: boolean) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      "process-compose",
      [
        "--use-uds",
        "--unix-socket",
        path.join(path.dirname(configPath), "process-compose.sock"),
        "--log-file",
        path.join(path.dirname(configPath), "process-compose.log"),
        "-f",
        configPath,
        "up",
        `--tui=${tui}`,
      ],
      { stdio: "inherit" },
    );
    const interrupt = () => child.kill("SIGINT");
    const terminate = () => child.kill("SIGTERM");
    process.on("SIGINT", interrupt);
    process.on("SIGTERM", terminate);
    const cleanup = () => {
      process.off("SIGINT", interrupt);
      process.off("SIGTERM", terminate);
    };
    child.once("error", (error: NodeJS.ErrnoException) => {
      cleanup();
      reject(
        error.code === "ENOENT"
          ? new Error(
              "saws dev requires process-compose on PATH. Install it with: brew install process-compose",
            )
          : error,
      );
    });
    child.once("exit", (code, signal) => {
      cleanup();
      if (signal != null) process.exitCode = signal === "SIGINT" ? 130 : 143;
      else process.exitCode = code ?? 1;
      resolve();
    });
  });
}

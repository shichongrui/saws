import { getSawsConfig, type ServiceDefinition } from "@saws/core";
import { getStageOutputs } from "@saws/core/utils/stage-outputs";
import { collectDevServices, DEV_READY_LINE } from "./process-compose.js";

let service: ServiceDefinition | undefined;
let stopping = false;

const shutdown = (code = 0) => {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  service?.exit();
  // Give children and asynchronous cleanup time to finish; process-compose enforces the outer timeout.
  setTimeout(() => process.exit(code), 8_000).unref();
};

process.once("SIGINT", () => shutdown());
process.once("SIGTERM", () => shutdown());
process.once("exit", () => {
  if (!stopping) service?.exit();
});
process.on("uncaughtException", (error) => {
  console.error(error);
  shutdown(1);
});
process.on("unhandledRejection", (error) => {
  console.error(error);
  shutdown(1);
});

try {
  const [configPath, serviceName, hookIndex] = process.argv.slice(2);
  if (configPath == null || serviceName == null)
    throw new Error("Missing development worker arguments");
  const root = await getSawsConfig(configPath);
  const services = collectDevServices(root);
  service = services.find((candidate) => candidate.name === serviceName);
  if (service == null) throw new Error(`Unknown service "${serviceName}"`);
  const outputs = await getStageOutputs("local");
  for (const dependency of services) {
    if (dependency === service) continue;
    dependency.outputs = outputs[dependency.name] ?? {};
    dependency.deved = true;
  }
  if (stopping) {
    service.exit();
  } else if (hookIndex != null) {
    // Function hooks may wait only for an AbortSignal, which does not keep Node alive.
    const keepAlive = setInterval(() => {}, 60_000);
    try {
      await service.devHook(Number(hookIndex));
    } finally {
      clearInterval(keepAlive);
    }
  } else {
    await service.devManaged(shutdown);
    service.getStdOut()?.pipe(process.stdout);
    service.getStdErr()?.pipe(process.stderr);
    if (!stopping) console.log(DEV_READY_LINE);
  }
} catch (error) {
  if (!stopping) {
    console.error(error);
    shutdown(1);
  }
}

import { createCacheDir } from "@saws/core/utils/create-directories";
import { onProcessExit } from "@saws/core/utils/on-exit";
import { getSawsConfig, type ServiceDefinition } from "@saws/core";
import { DevTui } from "./tui/dev-tui.js";

export const devCommand = async (path: string) => {
  process.env.NODE_ENV = "development";
  process.env.STAGE = "local";
  process.env.AWS_REGION = "us-west-2";

  await createCacheDir();

  const serviceDefinition = await getSawsConfig(path);
  const services = collectServices(serviceDefinition);
  const useTui = process.stdout.isTTY && process.stdin.isTTY;
  const tui = new DevTui(
    services.flatMap((service) => [service.name, ...service.getOnDevLogTabs()]),
  );

  const shutdown = () => {
    try {
      serviceDefinition.exit();
    } finally {
      tui.stop();
    }
  };

  onProcessExit(shutdown);
  process.once("SIGTERM", () => {
    shutdown();
    process.exit();
  });

  if (useTui) {
    serviceDefinition.setRuntimeLogSink(tui.logSink);
    tui.start();
  }

  await serviceDefinition.dev();

  if (useTui) {
    for (const service of services) {
      service.getStdOut()?.on("data", (chunk: Buffer) => {
        tui.logSink({
          serviceName: service.name,
          stream: "stdout",
          chunk: chunk.toString("utf8"),
          timestamp: new Date(),
        });
      });
      service.getStdErr()?.on("data", (chunk: Buffer) => {
        tui.logSink({
          serviceName: service.name,
          stream: "stderr",
          chunk: chunk.toString("utf8"),
          timestamp: new Date(),
        });
      });
    }
  } else {
    for (const service of services) {
      service.getStdOut()?.pipe(process.stdout);
      service.getStdErr()?.pipe(process.stderr);
    }
  }
};

function collectServices(root: ServiceDefinition) {
  return [...new Set(root.getAllDependencies())];
}

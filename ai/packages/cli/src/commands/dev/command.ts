import {
  DevContext,
  ExitContext,
  getSawsConfig,
  type ServiceDefinition,
} from "@saws/core";
import { DevTui } from "./tui/dev-tui.js";

const LOCAL_STAGE = "local";

export interface DevCommandOptions {
  rootDir?: string;
  config?: string;
  dryRun?: boolean;
}

export async function devCommand(
  path: string | undefined,
  options: DevCommandOptions
) {
  process.env.NODE_ENV = "development";
  process.env.STAGE = LOCAL_STAGE;

  const rootDir = options.rootDir ?? process.cwd();
  const serviceDefinition = await getSawsConfig(
    options.config ?? path
  );
  const tui = new DevTui(collectServices(serviceDefinition));
  const useTui = process.stdout.isTTY && process.stdin.isTTY;

  if (useTui) tui.start();

  const shutdown = async () => {
    try {
      await serviceDefinition.exit(
        new ExitContext({ stage: LOCAL_STAGE, rootDir })
      );
    } finally {
      tui.stop();
      process.exit();
    }
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  try {
    await serviceDefinition.dev(
      new DevContext({
        stage: LOCAL_STAGE,
        rootDir,
        dryRun: options.dryRun ?? false,
        env: process.env as Record<string, string>,
        logSink: useTui ? tui.logSink : undefined,
      })
    );

    // Service dev hooks start their processes without blocking so every
    // dependency can come up. Keep the command alive until a signal invokes
    // the shared shutdown path.
    if (!options.dryRun) {
      await new Promise<void>(() => {});
    }
  } catch (error) {
    if (useTui) {
      tui.writeSystemLog((error as Error).stack ?? String(error), "stderr");
    }
    throw error;
  } finally {
    tui.stop();
  }
}

function collectServices(root: ServiceDefinition) {
  const services: string[] = [];
  const seen = new Set<ServiceDefinition>();

  const visit = (service: ServiceDefinition) => {
    if (seen.has(service)) return;
    seen.add(service);

    for (const dependency of service.dependencies) {
      visit(dependency);
    }

    services.push(service.name);
  };

  visit(root);
  return services;
}

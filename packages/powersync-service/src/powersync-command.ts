import { spawn } from "node:child_process";
import path from "node:path";
import { Command } from "commander";
import type { PowerSyncService } from "./PowerSyncService.js";

export const createPowerSyncCommand = (services: PowerSyncService[]) =>
  new Command("powersync")
    .description("run the PowerSync CLI from the PowerSync service directory")
    .argument("[powersyncArgs...]", "arguments passed to powersync")
    .allowUnknownOption()
    .allowExcessArguments()
    .helpOption(false)
    .action((powersyncArgs: string[]) => powersyncCommand(services, powersyncArgs));

async function powersyncCommand(services: PowerSyncService[], powersyncArgs: string[]) {
  const service = resolveService(services);
  await service.runPowerSyncCli(powersyncArgs);
}

function resolveService(services: PowerSyncService[]) {
  if (services.length === 1) return services[0]!;
  if (services.length === 0) {
    throw new Error("No PowerSync services are configured.");
  }

  throw new Error(
    `Multiple PowerSync services are configured. Use the PowerSync CLI directly from one of these directories: ${services
      .map((service) => path.resolve(service.name))
      .join(", ")}`,
  );
}

export async function runPowerSyncCli(cwd: string, powersyncArgs: string[]) {
  const powersyncBin = path.resolve("node_modules", ".bin", "powersync");

  await new Promise<void>((resolve, reject) => {
    const child = spawn(powersyncBin, powersyncArgs, {
      cwd,
      env: process.env,
      stdio: "inherit",
    });

    child.once("error", (error) => {
      reject(new Error(`Unable to run powersync: ${error.message}`, { cause: error }));
    });

    child.once("close", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      const reason = signal == null ? `exit code ${code ?? "unknown"}` : `signal ${signal}`;
      reject(new Error(`powersync failed with ${reason}`));
    });
  });
}

import { spawn } from "node:child_process";
import path from "node:path";
import { Command } from "commander";
import type { PostgresService } from "./PostgresService.js";

export interface MigrateCommandOptions {
  rootDir?: string;
  service?: string;
  stage?: string;
  dryRun?: boolean;
}

type CommandRunner = (
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv },
) => Promise<void>;

export const createMigrateCommand = (
  services: PostgresService[],
  run: CommandRunner = runToCompletion,
) =>
  new Command("migrate")
    .description("run dbmate commands")
    .argument("[dbmateArgs...]", "arguments passed to dbmate")
    .option("--root-dir <path>", "project root containing the service migrations directory")
    .option("--service <name>", "Postgres service whose migrations and database URL to use")
    .option("--stage <stage>", "SAWS stage to migrate", "local")
    .option("--dry-run", "print the dbmate command without running it")
    .helpOption(false)
    .allowUnknownOption()
    .action((dbmateArgs: string[], options: MigrateCommandOptions) =>
      migrateCommand(services, dbmateArgs, options, run),
    );

export async function migrateCommand(
  services: PostgresService[],
  dbmateArgs: string[],
  options: MigrateCommandOptions,
  run: CommandRunner = runToCompletion,
) {
  const service = resolveService(options.service, services);
  const stage = options.stage ?? "local";
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const connection = await service.getConnectionInfo(stage, "host");
  const args = ["dbmate", ...dbmateArgs];
  const env = {
    ...process.env,
    DATABASE_URL: service.toDatabaseUrl(connection),
    DBMATE_MIGRATIONS_DIR: path.join(rootDir, service.name, "migrations"),
  };

  if (options.dryRun) {
    process.stdout.write(`[dry-run:local] npx ${args.join(" ")} (cwd: ${rootDir})\n`);
    return;
  }

  await run("npx", args, { cwd: rootDir, env });
}

function resolveService(requestedService: string | undefined, services: PostgresService[]) {
  if (requestedService != null) {
    const service = services.find((candidate) => candidate.name === requestedService);
    if (service != null) return service;
    throw new Error(
      `Postgres service "${requestedService}" was not found. Available services: ${services
        .map((candidate) => candidate.name)
        .join(", ")}`,
    );
  }

  if (services.length === 1) return services[0]!;
  if (services.length === 0) {
    throw new Error("No Postgres services are configured.");
  }

  throw new Error(
    `Multiple Postgres services are configured. Select one with --service: ${services
      .map((service) => service.name)
      .join(", ")}`,
  );
}

async function runToCompletion(
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv },
) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `${command} exited with code ${code ?? "unknown"}${signal == null ? "" : ` (${signal})`}`,
        ),
      );
    });
  });
}

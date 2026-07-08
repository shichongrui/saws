import path from "node:path";
import { Command } from "commander";
import type { PostgresService } from "./PostgresService.js";

export interface MigrateCommandOptions {
  rootDir?: string;
  service?: string;
  stage?: string;
  dryRun?: boolean;
}

export const createMigrateCommand = (services: PostgresService[]) =>
  new Command("migrate")
    .description("run dbmate commands in an ephemeral Docker container")
    .argument("[dbmateArgs...]", "arguments passed to dbmate")
    .option("--root-dir <path>", "project root containing the service migrations directory")
    .option("--service <name>", "Postgres service whose migrations and database URL to use")
    .option("--stage <stage>", "SAWS stage to migrate", "local")
    .option("--dry-run", "print the dbmate command without running it")
    .helpOption(false)
    .allowUnknownOption()
    .action((dbmateArgs: string[], options: MigrateCommandOptions) =>
      migrateCommand(services, dbmateArgs, options),
    );

export async function migrateCommand(
  services: PostgresService[],
  dbmateArgs: string[],
  options: MigrateCommandOptions,
) {
  const service = resolveService(options.service, services);
  const stage = options.stage ?? "local";
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const args = dbmateArgs.length === 0 ? ["--wait", "--no-dump-schema", "migrate"] : dbmateArgs;

  await service.runMigrations(stage, {
    rootDir,
    dbmateArgs: args,
    dryRun: options.dryRun,
  });
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

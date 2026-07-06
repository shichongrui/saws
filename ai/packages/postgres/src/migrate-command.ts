import { spawn } from "node:child_process";
import path from "node:path";
import { Command } from "commander";

export interface MigrateCommandOptions {
  rootDir?: string;
  config?: string;
  dryRun?: boolean;
  service?: string;
}

type CommandRunner = (
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv }
) => Promise<void>;

export const createMigrateCommand = (
  run: CommandRunner = runToCompletion,
  serviceNames: string[] = []
) =>
  new Command("migrate")
    .description("run dbmate commands")
    .argument("[dbmateArgs...]", "arguments passed to dbmate")
    .option(
      "--root-dir <string>",
      "project root containing the service migrations directory"
    )
    .option("--config <string>", "path to service definition")
    .option("--service <string>", "Postgres service whose migrations to use")
    .option("--dry-run", "print the dbmate command without running it")
    .helpOption(false)
    .allowUnknownOption()
    .action((dbmateArgs: string[], options: MigrateCommandOptions) =>
      migrateCommand(dbmateArgs, options, run, serviceNames)
    );

export async function migrateCommand(
  dbmateArgs: string[],
  options: MigrateCommandOptions,
  run: CommandRunner = runToCompletion,
  serviceNames: string[] = []
) {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const args = ["exec", "--", "dbmate", ...dbmateArgs];
  const serviceName = resolveServiceName(options.service, serviceNames);
  const env = {
    ...process.env,
    ...(serviceName == null
      ? {}
      : {
        DBMATE_MIGRATIONS_DIR: path.join(
          rootDir,
          serviceName,
          "migrations"
        ),
      }),
  };

  if (options.dryRun) {
    process.stdout.write(
      `[dry-run:local] npm ${args.join(" ")} (cwd: ${rootDir})\n`
    );
    return;
  }

  await run("npm", args, {
    cwd: rootDir,
    env,
  });
}

function resolveServiceName(
  requestedService: string | undefined,
  serviceNames: string[]
) {
  if (requestedService != null) {
    if (serviceNames.includes(requestedService)) return requestedService;
    throw new Error(
      `Postgres service "${requestedService}" was not found. Available services: ${serviceNames.join(", ")}`
    );
  }
  if (serviceNames.length <= 1) return serviceNames[0];
  throw new Error(
    `Multiple Postgres services are configured. Select one with --service: ${serviceNames.join(", ")}`
  );
}

async function runToCompletion(
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv }
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
          `${command} exited with code ${code ?? "unknown"}${signal == null ? "" : ` (${signal})`}`
        )
      );
    });
  });
}

import { spawn } from "node:child_process";
import path from "node:path";
import { Command } from "commander";

export interface MigrateCommandOptions {
  rootDir?: string;
  config?: string;
  dryRun?: boolean;
}

type CommandRunner = (
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv }
) => Promise<void>;

export const createMigrateCommand = (
  run: CommandRunner = runToCompletion
) =>
  new Command("migrate")
    .description("run dbmate commands")
    .argument("[dbmateArgs...]", "arguments passed to dbmate")
    .option("--root-dir <string>", "project root containing db/migrations")
    .option("--config <string>", "path to service definition")
    .option("--dry-run", "print the dbmate command without running it")
    .helpOption(false)
    .allowUnknownOption()
    .action((dbmateArgs: string[], options: MigrateCommandOptions) =>
      migrateCommand(dbmateArgs, options, run)
    );

export async function migrateCommand(
  dbmateArgs: string[],
  options: MigrateCommandOptions,
  run: CommandRunner = runToCompletion
) {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const args = ["exec", "--", "dbmate", ...dbmateArgs];

  if (options.dryRun) {
    process.stdout.write(
      `[dry-run:local] npm ${args.join(" ")} (cwd: ${rootDir})\n`
    );
    return;
  }

  await run("npm", args, {
    cwd: rootDir,
    env: process.env,
  });
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

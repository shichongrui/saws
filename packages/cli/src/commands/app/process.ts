import { spawn } from "node:child_process";

export async function runProcess(command: string, args: string[], cwd: string) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
    });

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal != null) {
        reject(new Error(`${command} exited from signal ${signal}`));
        return;
      }
      if (code !== 0) {
        reject(new Error(`${command} exited with code ${code ?? "unknown"}`));
        return;
      }
      resolve();
    });
  });
}

export async function runSaws(args: string[], cwd: string) {
  const cliPath = process.argv[1];
  if (cliPath == null) {
    throw new Error("Could not determine the SAWS CLI entry point");
  }
  await runProcess(process.execPath, [cliPath, ...args], cwd);
}

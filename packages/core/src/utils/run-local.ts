import { spawn } from "node:child_process";

export async function runLocal(
  command: string,
  options: {
    dryRun?: boolean;
    // context?: RuntimeContext;
    input?: string;
  } = {}
) {
  if (options.dryRun) {
    // if (options.context?.logSink == null) {
      console.log(`[dry-run:local] ${command}`);
    // } else {
    //   options.context.writeLog(`[dry-run:local] ${command}\n`);
    // }
    return;
  }

  await new Promise<void>((resolve, reject) => {
    // const captureOutput = options.context?.logSink != null;
    const child = spawn(command, {
      shell: true,
      stdio: [
        options.input == null ? "ignore" : "pipe",
        'inherit',
        'inherit'
        // captureOutput ? "pipe" : "inherit",
        // captureOutput ? "pipe" : "inherit",
      ],
    });

    if (options.input != null) {
      child.stdin?.end(options.input);
    }
    child.stdout?.on("data", (chunk: Buffer) => {
      console.log(chunk.toString("utf8"))
      // options.context?.writeLog(chunk.toString("utf8"), "stdout");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      console.error(chunk.toString("utf8"))
      // options.context?.writeLog(chunk.toString("utf8"), "stderr");
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`local command exited with code ${code}: ${command}`));
    });
  });
}

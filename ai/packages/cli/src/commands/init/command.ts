import {
  findServiceDefinition,
  getSawsConfig,
  InitContext,
} from "@saws/core";

export interface InitCommandOptions {
  rootDir?: string;
  config?: string;
  dryRun?: boolean;
}

export async function initCommand(
  serviceName: string,
  path: string | undefined,
  options: InitCommandOptions
) {
  const rootDir = options.rootDir ?? process.cwd();
  const rootService = await getSawsConfig(options.config ?? path);
  const service = findServiceDefinition(rootService, serviceName);

  await service.init(
    new InitContext({
      stage: "local",
      rootDir,
      dryRun: options.dryRun ?? false,
      env: process.env as Record<string, string>,
      logSink: ({ stream, chunk }) => {
        (stream === "stderr" ? process.stderr : process.stdout).write(chunk);
      },
    })
  );
}

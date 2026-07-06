import { findServiceDefinition, getSawsConfig, InitContext, } from "@saws/core";
export async function initCommand(serviceName, path, options) {
    const rootDir = options.rootDir ?? process.cwd();
    const rootService = await getSawsConfig(options.config ?? path);
    const service = findServiceDefinition(rootService, serviceName);
    await service.init(new InitContext({
        stage: "local",
        rootDir,
        dryRun: options.dryRun ?? false,
        env: process.env,
        logSink: ({ stream, chunk }) => {
            (stream === "stderr" ? process.stderr : process.stdout).write(chunk);
        },
    }));
}

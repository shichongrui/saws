import { DevContext, ExitContext, getSawsConfig, } from "@saws/core";
import { DevTui } from "./tui/dev-tui.js";
const LOCAL_STAGE = "local";
export async function devCommand(path, options) {
    process.env.NODE_ENV = "development";
    process.env.STAGE = LOCAL_STAGE;
    const rootDir = options.rootDir ?? process.cwd();
    const serviceDefinition = await getSawsConfig(options.config ?? path);
    const tui = new DevTui(collectServices(serviceDefinition));
    const useTui = process.stdout.isTTY && process.stdin.isTTY;
    if (useTui)
        tui.start();
    const shutdown = async () => {
        try {
            await serviceDefinition.exit(new ExitContext({ stage: LOCAL_STAGE, rootDir }));
        }
        finally {
            tui.stop();
            process.exit();
        }
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
    try {
        await serviceDefinition.dev(new DevContext({
            stage: LOCAL_STAGE,
            rootDir,
            dryRun: options.dryRun ?? false,
            env: process.env,
            logSink: useTui ? tui.logSink : undefined,
        }));
        // Service dev hooks start their processes without blocking so every
        // dependency can come up. Keep the command alive until a signal invokes
        // the shared shutdown path.
        if (!options.dryRun) {
            await new Promise(() => { });
        }
    }
    catch (error) {
        if (useTui) {
            tui.writeSystemLog(error.stack ?? String(error), "stderr");
        }
        throw error;
    }
    finally {
        tui.stop();
    }
}
function collectServices(root) {
    const services = [];
    const seen = new Set();
    const visit = (service) => {
        if (seen.has(service))
            return;
        seen.add(service);
        for (const dependency of service.dependencies) {
            visit(dependency);
        }
        services.push(service.name);
    };
    visit(root);
    return services;
}

import { DeployContext, getSawsConfig } from "@saws/core";
import { findConfiguredHosts } from "../../hosts.js";
export async function deployCommand(path, options) {
    if (options.stage == null || options.stage.length === 0) {
        throw new Error("deploy requires --stage <stage>");
    }
    if (options.stage === "local") {
        throw new Error("Can not deploy to local stage");
    }
    const serviceDefinition = await getSawsConfig(options.config ?? path);
    const dryRun = options.dryRun ?? false;
    for (const host of findConfiguredHosts(serviceDefinition)) {
        await host.assertReady({ dryRun });
    }
    await serviceDefinition.deploy(new DeployContext({
        stage: options.stage,
        rootDir: options.rootDir ?? process.cwd(),
        dryRun,
        env: process.env,
    }));
}

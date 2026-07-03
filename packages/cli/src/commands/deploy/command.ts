import { DeployContext, getSawsConfig } from "@saws/core";
import { findConfiguredHosts } from "../../hosts.js";

export interface DeployCommandOptions {
  stage: string;
  dryRun?: boolean;
  rootDir?: string;
  config?: string;
}

export async function deployCommand(
  path: string | undefined,
  options: DeployCommandOptions
) {
  if (options.stage == null || options.stage.length === 0) {
    throw new Error("deploy requires --stage <stage>");
  }

  if (options.stage === "local") {
    throw new Error("Can not deploy to local stage");
  }

  const serviceDefinition = await getSawsConfig(
    options.config ?? path
  );
  const dryRun = options.dryRun ?? false;

  for (const host of findConfiguredHosts(serviceDefinition)) {
    await host.assertReady({ dryRun });
  }

  await serviceDefinition.deploy(
    new DeployContext({
      stage: options.stage,
      rootDir: options.rootDir ?? process.cwd(),
      dryRun,
      env: process.env as Record<string, string>,
    })
  );
}

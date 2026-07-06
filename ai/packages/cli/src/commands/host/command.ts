import { getSawsConfig } from "@saws/core";
import type { Host } from "@saws/host";
import { findConfiguredHosts } from "../../hosts.js";

export interface ConfigureHostCommandOptions {
  config?: string;
  dryRun?: boolean;
}

export async function configureHostCommand(
  name: string | undefined,
  options: ConfigureHostCommandOptions
) {
  const root = await getSawsConfig(options.config);
  const hosts = findConfiguredHosts(root);
  const host = selectHost(hosts, name);

  await host.configure({ dryRun: options.dryRun });
}

export function selectHost(hosts: Host[], name?: string) {
  if (hosts.length === 0) {
    throw new Error("No Docker hosts are configured");
  }

  const host = name == null
    ? hosts.length === 1
      ? hosts[0]
      : undefined
    : hosts.find((candidate) => candidate.name === name);

  if (host != null) return host;

  const available = hosts.map((candidate) => candidate.name).sort().join(", ");
  throw new Error(
    name == null
      ? `Host name is required. Available hosts: ${available}`
      : `Host "${name}" was not found. Available hosts: ${available}`
  );
}

import { Host } from "@saws/host";
import type { ServiceDefinition } from "@saws/core";

export function findConfiguredHosts(root: ServiceDefinition) {
  const hosts = new Set<Host>();
  const visited = new Set<ServiceDefinition>();

  const visit = (service: ServiceDefinition) => {
    if (visited.has(service)) return;
    visited.add(service);

    const host = (
      service as ServiceDefinition & { docker?: { host?: unknown } }
    ).docker?.host;
    if (host instanceof Host) hosts.add(host);

    for (const dependency of service.dependencies) visit(dependency);
  };

  visit(root);
  return [...hosts];
}

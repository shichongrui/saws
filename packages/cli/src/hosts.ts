import { Host, type ServiceDefinition } from "@saws/core";

export function findConfiguredHosts(root: ServiceDefinition) {
  const hosts = new Set<Host>();
  const visited = new WeakSet<object>();

  const visit = (value: unknown) => {
    if (value == null || typeof value !== "object" || visited.has(value)) return;
    visited.add(value);

    if (value instanceof Host) {
      hosts.add(value);
      return;
    }

    for (const child of Object.values(value)) visit(child);
  };

  visit(root);
  return [...hosts];
}

import type { ServiceDefinition } from "./service-definition.js";

/**
 * Finds one configured service by name in a dependency graph.
 *
 * Service names are CLI identifiers, so a name must resolve to exactly one
 * service instance. Reusing the same instance in multiple branches is allowed.
 */
export function findServiceDefinition(
  root: ServiceDefinition,
  name: string
): ServiceDefinition {
  const matches: ServiceDefinition[] = [];
  const visited = new Set<ServiceDefinition>();

  const visit = (service: ServiceDefinition) => {
    if (visited.has(service)) return;
    visited.add(service);

    if (service.name === name) matches.push(service);
    for (const dependency of service.dependencies) visit(dependency);
  };

  visit(root);

  if (matches.length === 0) {
    const available = [...visited]
      .map((service) => service.name)
      .sort()
      .join(", ");
    throw new Error(
      `Service "${name}" was not found. Available services: ${available || "(none)"}`
    );
  }

  if (matches.length > 1) {
    throw new Error(
      `Service name "${name}" is ambiguous. Service names must be unique within a SAWS configuration.`
    );
  }

  return matches[0];
}

import type { Command } from "commander";
import { ServiceDefinition } from "./service-definition.js";

type ServiceConstructor = typeof ServiceDefinition;

/**
 * Collects commands contributed by the configured service types.
 *
 * A service class contributes its commands once even when several instances
 * exist in the graph or a shared instance appears in multiple branches.
 */
export function getServiceCommands(root: ServiceDefinition): Command[] {
  const visitedServices = new Set<ServiceDefinition>();
  const servicesByConstructor = new Map<
    ServiceConstructor,
    ServiceDefinition[]
  >();

  const visit = (service: ServiceDefinition) => {
    if (visitedServices.has(service)) return;
    visitedServices.add(service);

    const constructor = service.constructor as ServiceConstructor;
    const services = servicesByConstructor.get(constructor) ?? [];
    services.push(service);
    servicesByConstructor.set(constructor, services);

    for (const dependency of service.dependencies) visit(dependency);
  };

  visit(root);
  return [...servicesByConstructor].flatMap(([constructor, services]) =>
    constructor.getCommands(services)
  );
}

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
  const visitedConstructors = new Set<ServiceConstructor>();
  const commands: Command[] = [];

  const visit = (service: ServiceDefinition) => {
    if (visitedServices.has(service)) return;
    visitedServices.add(service);

    const constructor = service.constructor as ServiceConstructor;
    if (!visitedConstructors.has(constructor)) {
      visitedConstructors.add(constructor);
      commands.push(...constructor.getCommands());
    }

    for (const dependency of service.dependencies) visit(dependency);
  };

  visit(root);
  return commands;
}

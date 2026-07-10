import { findServiceDefinition, getSawsConfig, type ServiceDefinition } from "@saws/core";

export interface LogsCommandOptions {
  config?: string;
  stage: string;
}

export const logsCommand = async (serviceName: string | undefined, options: LogsCommandOptions) => {
  const { config, stage } = options;
  if (stage == null || stage.length === 0) {
    throw new Error("logs requires --stage <string>");
  }
  if (stage === "local") return;

  process.env.STAGE = stage;

  const serviceDefinition = await getSawsConfig(config);
  if (serviceName != null) {
    await findServiceDefinition(serviceDefinition, serviceName).logs(stage);
    return;
  }

  await Promise.all(collectServices(serviceDefinition).map((service) => service.logs(stage)));
};

function collectServices(root: ServiceDefinition) {
  return [...new Set(root.getAllDependencies())];
}

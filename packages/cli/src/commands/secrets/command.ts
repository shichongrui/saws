import { getSawsConfigModule, SecretsManager, type GlobalSecrets } from "@saws/core";

export interface SecretsCommandOptions {
  config?: string;
  stage?: string;
  global?: boolean;
  set?: string;
  get?: boolean;
}

export async function secretsCommand(name: string, options: SecretsCommandOptions) {
  const value = options.set;
  if (options.get && value != null) {
    throw new Error("secrets accepts only one of --get or --set <value>");
  }
  if (!options.get && value == null) {
    throw new Error("secrets requires either --get or --set <value>");
  }

  if (!options.global) {
    process.env.STAGE = options.stage ?? "local";
  }

  const config = await getSawsConfigModule(options.config);
  const manager = config.secrets;
  if (!(manager instanceof SecretsManager)) {
    throw new Error('saws.ts must export a SecretsManager instance named "secrets"');
  }

  const secrets: SecretsManager | GlobalSecrets = options.global ? manager.global : manager;

  if (options.get) {
    console.log(await secrets.get(name));
    return;
  }

  if (value == null) {
    throw new Error("secrets requires --set <value>");
  }
  await secrets.set(name, value);
  console.log("Set secret");
}

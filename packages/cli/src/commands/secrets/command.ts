import { getSawsConfigModule, SecretsManager } from "@saws/core";

type SecretsStore = Pick<SecretsManager, "get" | "set">;
type SecretsManagerLike = SecretsStore & { global: SecretsStore };

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

  const secrets = options.global
    ? new SecretsManager().global
    : await getStageSecretsManager(options.stage ?? "local", options.config);

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

async function getStageSecretsManager(stage: string, configPath?: string) {
  process.env.STAGE = stage;
  const config = await getSawsConfigModule(configPath);
  const manager =
    Object.values(config).find(
      (candidate): candidate is SecretsManager => candidate instanceof SecretsManager,
    ) ?? config.secrets;
  if (!isSecretsManagerLike(manager)) {
    throw new Error('saws.ts must export a SecretsManager instance named "secrets"');
  }
  return manager;
}

function isSecretsManagerLike(value: unknown): value is SecretsManagerLike {
  if (value == null || typeof value !== "object") return false;

  const candidate = value as Partial<SecretsManagerLike>;
  return (
    typeof candidate.get === "function" &&
    typeof candidate.set === "function" &&
    candidate.global != null &&
    typeof candidate.global.get === "function" &&
    typeof candidate.global.set === "function"
  );
}

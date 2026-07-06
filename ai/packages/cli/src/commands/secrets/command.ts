import { SecretsManager } from "@saws/secrets";

export interface SecretsCommandOptions {
  stage?: string;
  set?: string;
  get?: boolean;
  rootDir?: string;
}

export async function secretsCommand(
  name: string,
  options: SecretsCommandOptions
) {
  const manager = new SecretsManager({
    stage: options.stage ?? "local",
    rootDir: options.rootDir ?? process.cwd(),
  });

  if (options.get) {
    console.log(await manager.get(name));
    return;
  }

  if (options.set == null) {
    throw new Error("secrets requires either --get or --set <value>");
  }

  await manager.set(name, options.set);
  console.log("Set secret");
}

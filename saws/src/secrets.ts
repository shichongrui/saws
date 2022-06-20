import { getParameter, putParameter } from "./aws/ssm";
import { Data, parse, stringify } from "envfile";
import { promises as fs } from "fs";

export interface SecretsManager {
  get(name: string): Promise<string>;
  set(name: string, value: string): Promise<void>;
}

let cache: Record<string, string> = {};

class LocalSecretsManager implements SecretsManager {
  async fillCache() {
    if (Object.keys(cache).length === 0) {
      const secretsFile = await fs.readFile("./.secrets", {
        encoding: "utf-8",
      });
      cache = parse(secretsFile);
    }
  }

  async get(name: string) {
    await this.fillCache?.();
    return cache[name];
  }

  async set(name: string, value: string) {
    await this.fillCache?.();
    cache[name] = value;
    await fs.writeFile("./.secrets", stringify(cache));
  }
}

class ParameterStoreSecretsManager implements SecretsManager {
  stage: string;

  constructor(stage?: string) {
    this.stage = stage ?? (process.env.STAGE as string);
  }

  async get(name: string) {
    if (cache[name] != null) {
      return cache[name];
    }

    const value = await getParameter(`/${this.stage}/${name}`, true);
    cache[name] = value;
    return value;
  }

  async set(name: string, value: string) {
    cache[name] = value;
    await putParameter(`/${this.stage}/${name}`, value, true);
  }
}

export const getSecretsManagerForStage = (stage: string) => {
  return stage === "local"
    ? new LocalSecretsManager()
    : new ParameterStoreSecretsManager(stage);
};

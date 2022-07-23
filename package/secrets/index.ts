import { SSM } from "../aws/ssm";
import path from 'path';
import { parse, stringify } from "envfile";
import { promises as fs } from "fs";
import { SAWS_DIR } from "../utils/constants";

export interface SecretsManagerInterface {
  get(name: string): Promise<string>;
  set(name: string, value: string): Promise<void>;
}

let cache: Record<string, string> = {};

class LocalSecretsManager implements SecretsManagerInterface {
  secretsFilePath = path.resolve(SAWS_DIR, ".secrets")

  async fillCache() {
    if (Object.keys(cache).length === 0) {
      const secretsFile = await fs.readFile(this.secretsFilePath, {
        encoding: "utf-8",
      });
      cache = parse(secretsFile);
    }
  }

  async get(name: string) {
    await this.fillCache?.();
    if (cache[name] == null) {
      const error = new Error('Missing');
      error.name = 'ParameterNotFound';
      throw error;
    }
    return cache[name];
  }

  async set(name: string, value: string) {
    await this.fillCache?.();
    cache[name] = value;
    await fs.writeFile(this.secretsFilePath, stringify(cache));
  }
}

class ParameterStoreSecretsManager implements SecretsManagerInterface {
  stage: string;
  ssmClient: SSM;

  constructor(stage?: string) {
    this.stage = stage ?? (process.env.STAGE as string);
    this.ssmClient = new SSM();
  }

  async get(name: string) {
    if (cache[name] != null) {
      return cache[name];
    }

    const value = await this.ssmClient.getParameter(`/${this.stage}/${name}`, true);
    cache[name] = value;
    return value;
  }

  async set(name: string, value: string) {
    cache[name] = value;
    await this.ssmClient.putParameter(`/${this.stage}/${name}`, value, true);
  }
}

export default class SecretsManager implements SecretsManagerInterface {
  manager: SecretsManagerInterface;

  constructor(stage: string) {
    this.manager = stage === "local"
      ? new LocalSecretsManager()
      : new ParameterStoreSecretsManager(stage);
  }

  get(name: string): Promise<string> {
    return this.manager.get(name);
  }

  set(name: string, value: string): Promise<void> {
    return this.manager.set(name, value);
  }
}

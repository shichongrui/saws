import { SSM } from "@shichongrui/saws-aws/ssm";
import { SAWS_DIR } from "@shichongrui/saws-utils/constants";
import { resolve } from "node:path";
import { promises as fs } from "fs";

export interface SecretsManagerInterface {
  get(name: string): Promise<string>;
  set(name: string, value: string): Promise<void>;
}

let cache: Record<string, string> = {};

class LocalSecretsManager implements SecretsManagerInterface {
  secretsFilePath = resolve(SAWS_DIR, ".secrets");

  async ensureSecretsFileExists() {
    try {
      await fs.stat(this.secretsFilePath);
    } catch (err) {
      await fs.writeFile(this.secretsFilePath, "");
    }
  }

  async fillCache() {
    await this.ensureSecretsFileExists();
    if (Object.keys(cache).length === 0) {
      const secretsFile = await fs.readFile(this.secretsFilePath, {
        encoding: "utf-8",
      });
      cache = (await import("envfile")).parse(secretsFile);
    }
  }

  async get(name: string) {
    await this.fillCache();
    if (cache[name] == null) {
      const error = new Error("Missing");
      error.name = "ParameterNotFound";
      throw error;
    }
    return cache[name];
  }

  async set(name: string, value: string) {
    await this.fillCache();
    cache[name] = value;
    await fs.writeFile(
      this.secretsFilePath,
      (await import("envfile")).stringify(cache)
    );
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

    const value = await this.ssmClient.getParameter(
      `/${this.stage}/${name}`,
      true
    );
    cache[name] = value;
    return value;
  }

  async set(name: string, value: string) {
    cache[name] = value;
    await this.ssmClient.putParameter(`/${this.stage}/${name}`, value, true);
  }
}

export class SecretsManager implements SecretsManagerInterface {
  manager: SecretsManagerInterface;

  constructor(stage: string = String(process.env.STAGE)) {
    this.manager =
      stage === "local"
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

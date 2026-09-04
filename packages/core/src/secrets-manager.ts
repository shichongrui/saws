import { appendFile, chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { createCipheriv, createDecipheriv, randomBytes, scrypt } from "node:crypto";
import path from "node:path";
import { getSawsHome } from "./saws-home.js";

const PASSCODE_ENV_NAME = "SAWS_SECRETS_PASSCODE";
const GLOBAL_SCOPE = "global";
const ENCRYPTION_VERSION = 1;
const KEY_LENGTH = 32;
const SCRYPT_COST = 16_384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;

export interface SecretsManagerConfig {
  /** Overrides the stage derived from the command's runtime context or STAGE. */
  stage?: string;
  /** Root for stage-scoped secrets and their passcode file. Defaults to the current directory. */
  rootDir?: string;
  /** Overrides the directory containing stage-scoped secrets. Defaults to `<rootDir>/.saws`. */
  sawsDirectory?: string;
  /** Overrides SAWS_SECRETS_PASSCODE and the project-root .env file for stage secrets. */
  passcode?: string;
}

export type SecretScope = "stage" | "global";

export interface SecretResolutionContext {
  stage: string;
  rootDir?: string;
}

export class ParameterNotFoundError extends Error {
  constructor(name: string) {
    super(`Secret not found: ${name}`);
    this.name = "ParameterNotFound";
  }
}

export class SecretsDecryptionError extends Error {
  constructor() {
    super(
      `Unable to decrypt secrets. Check ${PASSCODE_ENV_NAME} or the applicable SAWS .env file.`,
    );
    this.name = "SecretsDecryptionError";
  }
}

interface EncryptedSecretsFile {
  version: 1;
  kdf: {
    name: "scrypt";
    salt: string;
    cost: 16384;
    blockSize: 8;
    parallelization: 1;
  };
  cipher: {
    name: "aes-256-gcm";
    iv: string;
    authTag: string;
  };
  ciphertext: string;
}

/**
 * A lazy reference to either a stage-aware or global secret.
 *
 * References can safely be created while saws.ts is loaded, before the CLI
 * knows which runtime stage will consume a stage-aware secret.
 */
export class SecretReference {
  readonly name: string;
  readonly scope: SecretScope;
  private readonly manager: SecretsManager;

  constructor(manager: SecretsManager, name: string, scope: SecretScope) {
    if (name.trim().length === 0) {
      throw new Error("Secret reference name cannot be empty");
    }
    this.manager = manager;
    this.name = name;
    this.scope = scope;
  }

  resolve(context?: SecretResolutionContext): Promise<string> {
    if (this.scope === "stage" && context == null) {
      return this.manager.getFromScope(this.name, this.scope);
    }
    return this.manager.getFromScope(this.name, this.scope, context?.stage);
  }

  /** @internal */
  isManagedBy(manager: SecretsManager) {
    return this.manager === manager;
  }
}

export class GlobalSecrets {
  private readonly manager: SecretsManager;

  constructor(manager: SecretsManager) {
    this.manager = manager;
  }

  reference(name: string): SecretReference {
    return new SecretReference(this.manager, name, GLOBAL_SCOPE);
  }

  async get(name: string): Promise<string> {
    return this.manager.getFromScope(name, GLOBAL_SCOPE);
  }

  async set(name: string, value: string): Promise<void> {
    await this.manager.setInScope(name, value, GLOBAL_SCOPE);
  }

  get secretsFilePath() {
    return this.manager.getSecretsFilePath(GLOBAL_SCOPE);
  }
}

export class SecretsManager {
  readonly global: GlobalSecrets;
  readonly rootDir: string;
  readonly sawsDirectory: string;
  private readonly globalSawsDirectory: string;
  private readonly configuredStage?: string;
  private readonly configuredPasscode?: string;

  constructor(config: SecretsManagerConfig = {}) {
    this.configuredStage = config.stage == null ? undefined : requireValidStage(config.stage);
    this.rootDir = config.rootDir ?? process.cwd();
    this.sawsDirectory = config.sawsDirectory ?? path.resolve(this.rootDir, ".saws");
    this.globalSawsDirectory = getSawsHome();
    this.configuredPasscode = config.passcode;
    this.global = new GlobalSecrets(this);
  }

  get stage() {
    return this.resolveStage();
  }

  reference(name: string): SecretReference {
    return new SecretReference(this, name, "stage");
  }

  async get(name: string): Promise<string> {
    return this.getFromScope(name, "stage");
  }

  async set(name: string, value: string): Promise<void> {
    await this.setInScope(name, value, "stage");
  }

  get secretsFilePath() {
    return this.getSecretsFilePath("stage");
  }

  /** @internal */
  async getFromScope(name: string, scope: SecretScope, resolutionStage?: string): Promise<string> {
    const secrets = await this.readSecrets(scope, resolutionStage);
    const value = secrets[name];
    if (value == null) throw new ParameterNotFoundError(name);
    return value;
  }

  /** @internal */
  async setInScope(
    name: string,
    value: string,
    scope: SecretScope,
    resolutionStage?: string,
  ): Promise<void> {
    const secrets = await this.readSecrets(scope, resolutionStage);
    secrets[name] = value;
    await this.writeSecrets(secrets, scope, resolutionStage);
  }

  /** @internal */
  getSecretsFilePath(scope: SecretScope, resolutionStage?: string) {
    if (scope === GLOBAL_SCOPE) {
      return path.resolve(this.globalSawsDirectory, "secrets", "global.env");
    }
    return path.resolve(this.sawsDirectory, "secrets", `${this.resolveStage(resolutionStage)}.env`);
  }

  private resolveStage(resolutionStage?: string) {
    const stage = this.configuredStage ?? resolutionStage ?? process.env.STAGE;
    if (stage == null || stage.length === 0) {
      throw new Error(
        "Unable to determine the secrets stage. Run the command with --stage or set STAGE.",
      );
    }
    return requireValidStage(stage);
  }

  private async readSecrets(
    scope: SecretScope,
    resolutionStage?: string,
  ): Promise<Record<string, string>> {
    const secretsFilePath = this.getSecretsFilePath(scope, resolutionStage);
    let contents: string;
    try {
      contents = await readFile(secretsFilePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      return {};
    }

    const encrypted = parseEncryptedFile(contents);
    if (encrypted != null) {
      const passcode = await this.getPasscode(scope, false);
      if (passcode == null) {
        throw new Error(`${PASSCODE_ENV_NAME} is required to decrypt ${secretsFilePath}`);
      }
      return decryptSecrets(encrypted, passcode);
    }

    // Migrate files written by older SAWS versions as soon as they are used.
    const secrets = parseEnvFile(contents);
    await this.writeSecrets(secrets, scope, resolutionStage);
    return secrets;
  }

  private async writeSecrets(
    secrets: Record<string, string>,
    scope: SecretScope,
    resolutionStage?: string,
  ) {
    const passcode = await this.getPasscode(scope, true);
    if (passcode == null) {
      throw new Error(`Unable to create ${PASSCODE_ENV_NAME}`);
    }
    const secretsFilePath = this.getSecretsFilePath(scope, resolutionStage);
    await mkdir(path.dirname(secretsFilePath), { recursive: true });
    const temporaryPath = `${secretsFilePath}.${randomBytes(8).toString("hex")}.tmp`;

    try {
      await writeFile(
        temporaryPath,
        JSON.stringify(await encryptSecrets(secrets, passcode), null, 2).concat("\n"),
        { mode: 0o600 },
      );
      await rename(temporaryPath, secretsFilePath);
      await chmod(secretsFilePath, 0o600);
    } finally {
      await rm(temporaryPath, { force: true });
    }
  }

  private async getPasscode(scope: SecretScope, createIfMissing: boolean) {
    if (scope !== GLOBAL_SCOPE && this.configuredPasscode != null) {
      return requireNonemptyPasscode(this.configuredPasscode);
    }

    if (process.env[PASSCODE_ENV_NAME] != null) {
      return requireNonemptyPasscode(process.env[PASSCODE_ENV_NAME]);
    }

    const envFilePath = path.resolve(
      scope === GLOBAL_SCOPE ? this.globalSawsDirectory : this.rootDir,
      ".env",
    );
    try {
      const environment = parseEnvFile(await readFile(envFilePath, "utf8"));
      if (environment[PASSCODE_ENV_NAME] != null) {
        return requireNonemptyPasscode(environment[PASSCODE_ENV_NAME]);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }

    if (!createIfMissing) return undefined;

    const passcode = randomBytes(32).toString("base64url");
    let needsLeadingNewline = false;
    try {
      const contents = await readFile(envFilePath, "utf8");
      needsLeadingNewline = contents.length > 0 && !contents.endsWith("\n");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await mkdir(path.dirname(envFilePath), { recursive: true });
    await appendFile(
      envFilePath,
      `${needsLeadingNewline ? "\n" : ""}${PASSCODE_ENV_NAME}=${passcode}\n`,
      { mode: 0o600 },
    );
    await chmod(envFilePath, 0o600);
    return passcode;
  }
}

function requireValidStage(stage: string) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(stage)) {
    throw new Error(
      "Secrets stage must start with a letter or number and contain only letters, numbers, underscores, and hyphens",
    );
  }
  if (stage.toLowerCase() === GLOBAL_SCOPE) {
    throw new Error(`Secrets stage "${GLOBAL_SCOPE}" is reserved for global secrets`);
  }
  return stage;
}

function requireNonemptyPasscode(passcode: string) {
  if (passcode.length === 0) {
    throw new Error(`${PASSCODE_ENV_NAME} cannot be empty`);
  }
  return passcode;
}

function parseEncryptedFile(contents: string): EncryptedSecretsFile | undefined {
  let value: unknown;
  try {
    value = JSON.parse(contents);
  } catch {
    return undefined;
  }

  if (value == null || typeof value !== "object" || !("version" in value)) {
    return undefined;
  }

  const encrypted = value as Partial<EncryptedSecretsFile>;
  if (
    encrypted.version !== ENCRYPTION_VERSION ||
    encrypted.kdf?.name !== "scrypt" ||
    typeof encrypted.kdf.salt !== "string" ||
    encrypted.kdf.cost !== SCRYPT_COST ||
    encrypted.kdf.blockSize !== SCRYPT_BLOCK_SIZE ||
    encrypted.kdf.parallelization !== SCRYPT_PARALLELIZATION ||
    encrypted.cipher?.name !== "aes-256-gcm" ||
    typeof encrypted.cipher.iv !== "string" ||
    typeof encrypted.cipher.authTag !== "string" ||
    typeof encrypted.ciphertext !== "string"
  ) {
    throw new Error("Unsupported or invalid encrypted secrets file");
  }

  return encrypted as EncryptedSecretsFile;
}

async function encryptSecrets(
  secrets: Record<string, string>,
  passcode: string,
): Promise<EncryptedSecretsFile> {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveKey(passcode, salt);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(stringifyEnvFile(secrets), "utf8"),
    cipher.final(),
  ]);

  return {
    version: ENCRYPTION_VERSION,
    kdf: {
      name: "scrypt",
      salt: salt.toString("base64"),
      cost: SCRYPT_COST,
      blockSize: SCRYPT_BLOCK_SIZE,
      parallelization: SCRYPT_PARALLELIZATION,
    },
    cipher: {
      name: "aes-256-gcm",
      iv: iv.toString("base64"),
      authTag: cipher.getAuthTag().toString("base64"),
    },
    ciphertext: ciphertext.toString("base64"),
  };
}

async function decryptSecrets(encrypted: EncryptedSecretsFile, passcode: string) {
  try {
    const salt = Buffer.from(encrypted.kdf.salt, "base64");
    const key = await deriveKey(passcode, salt);
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(encrypted.cipher.iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(encrypted.cipher.authTag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
    return parseEnvFile(plaintext);
  } catch {
    throw new SecretsDecryptionError();
  }
}

function deriveKey(passcode: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      passcode,
      salt,
      KEY_LENGTH,
      {
        N: SCRYPT_COST,
        r: SCRYPT_BLOCK_SIZE,
        p: SCRYPT_PARALLELIZATION,
      },
      (error, key) => {
        if (error != null) reject(error);
        else resolve(key);
      },
    );
  });
}

function parseEnvFile(contents: string): Record<string, string> {
  const values: Record<string, string> = {};

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    values[key] = parseEnvValue(rawValue);
  }

  return values;
}

function parseEnvValue(value: string) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1).replaceAll("\\n", "\n").replaceAll('\\"', '"');
  }

  return value;
}

function stringifyEnvFile(values: Record<string, string>) {
  return Object.entries(values)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join("\n")
    .concat("\n");
}

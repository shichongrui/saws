import {
  appendFile,
  chmod,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scrypt,
} from "node:crypto";
import path from "node:path";

const PASSCODE_ENV_NAME = "SAWS_SECRETS_PASSCODE";
const ENCRYPTION_VERSION = 1;
const KEY_LENGTH = 32;
const SCRYPT_COST = 16_384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;

export interface SecretsManagerConfig {
  stage: string;
  rootDir?: string;
  /** Overrides SAWS_SECRETS_PASSCODE and the project-root .env file. */
  passcode?: string;
}

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
      `Unable to decrypt secrets. Check ${PASSCODE_ENV_NAME} in the project-root .env file.`
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
 * A lazy reference to a stage-aware secret.
 *
 * References can safely be created while saws.ts is loaded, before the CLI
 * knows which runtime stage will consume the secret.
 */
export class SecretReference {
  readonly name: string;

  constructor(name: string) {
    if (name.trim().length === 0) {
      throw new Error("Secret reference name cannot be empty");
    }
    this.name = name;
  }

  resolve(context: SecretResolutionContext): Promise<string> {
    return new SecretsManager({
      stage: context.stage,
      rootDir: context.rootDir,
    }).get(this.name);
  }
}

export class SecretsManager {
  readonly stage: string;
  readonly rootDir: string;
  private readonly configuredPasscode?: string;

  constructor(config: SecretsManagerConfig) {
    this.stage = config.stage;
    this.rootDir = config.rootDir ?? process.cwd();
    this.configuredPasscode = config.passcode;
  }

  static reference(name: string): SecretReference {
    return new SecretReference(name);
  }

  async get(name: string): Promise<string> {
    const secrets = await this.readSecrets();
    const value = secrets[name];
    if (value == null) throw new ParameterNotFoundError(name);
    return value;
  }

  async set(name: string, value: string): Promise<void> {
    const secrets = await this.readSecrets();
    secrets[name] = value;
    await this.writeSecrets(secrets);
  }

  get secretsFilePath() {
    return path.resolve(this.rootDir, ".saws", "secrets", `${this.stage}.env`);
  }

  private async readSecrets(): Promise<Record<string, string>> {
    let contents: string;
    try {
      contents = await readFile(this.secretsFilePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      return {};
    }

    const encrypted = parseEncryptedFile(contents);
    if (encrypted != null) {
      const passcode = await this.getPasscode(false);
      if (passcode == null) {
        throw new Error(
          `${PASSCODE_ENV_NAME} is required to decrypt ${this.secretsFilePath}`
        );
      }
      return decryptSecrets(encrypted, passcode);
    }

    // Migrate files written by older SAWS versions as soon as they are used.
    const secrets = parseEnvFile(contents);
    await this.writeSecrets(secrets);
    return secrets;
  }

  private async writeSecrets(secrets: Record<string, string>) {
    const passcode = await this.getPasscode(true);
    if (passcode == null) {
      throw new Error(`Unable to create ${PASSCODE_ENV_NAME}`);
    }
    await mkdir(path.dirname(this.secretsFilePath), { recursive: true });
    const temporaryPath = `${this.secretsFilePath}.${randomBytes(8).toString("hex")}.tmp`;

    try {
      await writeFile(
        temporaryPath,
        JSON.stringify(await encryptSecrets(secrets, passcode), null, 2).concat(
          "\n"
        ),
        { mode: 0o600 }
      );
      await rename(temporaryPath, this.secretsFilePath);
      await chmod(this.secretsFilePath, 0o600);
    } finally {
      await rm(temporaryPath, { force: true });
    }
  }

  private async getPasscode(createIfMissing: boolean) {
    if (this.configuredPasscode != null) {
      return requireNonemptyPasscode(this.configuredPasscode);
    }

    if (process.env[PASSCODE_ENV_NAME] != null) {
      return requireNonemptyPasscode(process.env[PASSCODE_ENV_NAME]);
    }

    const envFilePath = path.resolve(this.rootDir, ".env");
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
    await appendFile(
      envFilePath,
      `${needsLeadingNewline ? "\n" : ""}${PASSCODE_ENV_NAME}=${passcode}\n`,
      { mode: 0o600 }
    );
    await chmod(envFilePath, 0o600);
    return passcode;
  }
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

  if (
    value == null ||
    typeof value !== "object" ||
    !("version" in value)
  ) {
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
  passcode: string
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

async function decryptSecrets(
  encrypted: EncryptedSecretsFile,
  passcode: string
) {
  try {
    const salt = Buffer.from(encrypted.kdf.salt, "base64");
    const key = await deriveKey(passcode, salt);
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(encrypted.cipher.iv, "base64")
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
      }
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

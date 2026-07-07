import { execFile } from "node:child_process";
import { chmod, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  Host,
  ParameterNotFoundError,
  SecretsManager,
  ServiceDefinition,
  getSawsConfigModule,
  hostSshPublicKeyEnvName,
} from "@saws/core";
import { findConfiguredHosts } from "../../hosts.js";

export interface ConfigureHostCommandOptions {
  config?: string;
  dryRun?: boolean;
  user: string;
}

export async function configureHostCommand(
  name: string | undefined,
  options: ConfigureHostCommandOptions,
) {
  const config = await getSawsConfigModule(options.config);
  if (!(config.secrets instanceof SecretsManager)) {
    throw new Error('saws.ts must export a SecretsManager instance named "secrets"');
  }
  if (!(config.default instanceof ServiceDefinition)) {
    throw new Error("saws.ts must default-export a ServiceDefinition");
  }

  const host = selectHost(findConfiguredHosts(config.default), name);
  validatePrivateKeyReference(host, config.secrets);

  if (options.dryRun) {
    await host.configure({
      bootstrapUser: options.user,
      deploymentPublicKey: "[redacted deployment public key]",
      dryRun: true,
    });
    return;
  }

  const { privateKey, created } = await getOrCreateDeploymentKey(config.secrets, host);
  const publicKey = await derivePublicKey(privateKey);

  if (created) {
    await config.secrets.global.set(host.sshPrivateKey!.name, privateKey);
  }
  await updatePublicKeyEnvironment(
    config.secrets.rootDir,
    hostSshPublicKeyEnvName(host.name),
    publicKey,
  );
  await host.configure({
    bootstrapUser: options.user,
    deploymentPublicKey: publicKey,
  });
}

export function selectHost(hosts: Host[], name?: string) {
  if (hosts.length === 0) {
    throw new Error("No hosts are configured");
  }

  const host =
    name == null
      ? hosts.length === 1
        ? hosts[0]
        : undefined
      : hosts.find((candidate) => candidate.name === name);

  if (host != null) return host;

  const available = hosts
    .map((candidate) => candidate.name)
    .sort()
    .join(", ");
  throw new Error(
    name == null
      ? `Host name is required. Available hosts: ${available}`
      : `Host "${name}" was not found. Available hosts: ${available}`,
  );
}

function validatePrivateKeyReference(host: Host, manager: SecretsManager) {
  if (host.sshPrivateKey == null || host.sshPrivateKey.scope !== "global") {
    throw new Error(
      `Host "${host.name}" must configure sshPrivateKey with secrets.global.reference(...)`,
    );
  }

  if (!host.sshPrivateKey.isManagedBy(manager)) {
    throw new Error(
      `Host "${host.name}" sshPrivateKey must use the SecretsManager exported as "secrets"`,
    );
  }
}

async function getOrCreateDeploymentKey(manager: SecretsManager, host: Host) {
  try {
    return {
      privateKey: await manager.global.get(host.sshPrivateKey!.name),
      created: false,
    };
  } catch (error) {
    if (!(error instanceof ParameterNotFoundError)) throw error;
  }

  return {
    privateKey: await generatePrivateKey(),
    created: true,
  };
}

async function generatePrivateKey() {
  return withTemporaryDirectory(async (directory) => {
    const keyPath = path.join(directory, "id_ed25519");
    await execFileAsync("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-f", keyPath]);
    return readFile(keyPath, "utf8");
  });
}

async function derivePublicKey(privateKey: string) {
  return withTemporaryDirectory(async (directory) => {
    const keyPath = path.join(directory, "id_ed25519");
    await writeFile(keyPath, privateKey, { mode: 0o600 });
    const { stdout } = await execFileAsync("ssh-keygen", ["-y", "-f", keyPath]);
    const publicKey = stdout.trim();
    if (publicKey.length === 0) {
      throw new Error("Could not derive the deployment public key");
    }
    return publicKey;
  });
}

async function withTemporaryDirectory<T>(callback: (directory: string) => Promise<T>) {
  const directory = await mkdtemp(path.join(tmpdir(), "saws-key-"));
  try {
    return await callback(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function updatePublicKeyEnvironment(
  rootDir: string,
  variableName: string,
  publicKey: string,
) {
  const envPath = path.resolve(rootDir, ".env");
  let contents = "";
  try {
    contents = await readFile(envPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const matcher = new RegExp(`^(?:export\\s+)?${escapeRegExp(variableName)}\\s*=`);
  const lines = contents.split(/\r?\n/);
  const replacement = `${variableName}=${publicKey}`;
  let replaced = false;
  const updated = lines.flatMap((line) => {
    if (!matcher.test(line)) return [line];
    if (replaced) return [];
    replaced = true;
    return [replacement];
  });
  while (updated.at(-1) === "") updated.pop();
  if (!replaced) updated.push(replacement);

  const temporaryPath = `${envPath}.${process.pid}.tmp`;
  try {
    await writeFile(temporaryPath, `${updated.join("\n")}\n`, { mode: 0o600 });
    await rename(temporaryPath, envPath);
    await chmod(envPath, 0o600);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const execFileAsync = promisify(execFile);

import { readFile } from "node:fs/promises";
import path from "node:path";
import { ParameterNotFoundError, getGlobalHost, getGlobalHostSecretsManager } from "@saws/core";
import { derivePublicKey } from "./deployment-key.js";

export interface ImportHostKeyCommandOptions {
  file: string;
  force?: boolean;
}

export async function importHostKeyCommand(name: string, options: ImportHostKeyCommandOptions) {
  const host = getGlobalHost(name);
  const keyPath = path.resolve(options.file);
  let privateKey: string;
  try {
    privateKey = await readFile(keyPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`SSH private key file does not exist: ${keyPath}`);
    }
    throw error;
  }
  if (privateKey.trim().length === 0) {
    throw new Error(`SSH private key file is empty: ${keyPath}`);
  }
  await derivePublicKey(privateKey);

  const manager = getGlobalHostSecretsManager();
  const secretName = host.sshPrivateKey!.name;
  if (!options.force && (await secretExists(manager, secretName))) {
    throw new Error(
      `Global host "${host.name}" already has a deployment key; pass --force to replace it`,
    );
  }

  await manager.global.set(secretName, privateKey);
  console.log(`Imported deployment key for global host "${host.name}"`);
}

async function secretExists(
  manager: ReturnType<typeof getGlobalHostSecretsManager>,
  secretName: string,
) {
  try {
    await manager.global.get(secretName);
    return true;
  } catch (error) {
    if (error instanceof ParameterNotFoundError) return false;
    throw error;
  }
}

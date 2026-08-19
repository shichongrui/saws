import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

export async function generatePrivateKey() {
  return withTemporaryDirectory(async (directory) => {
    const keyPath = path.join(directory, "id_ed25519");
    await execFileAsync("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-f", keyPath]);
    return readFile(keyPath, "utf8");
  });
}

export async function derivePublicKey(privateKey: string) {
  return withTemporaryDirectory(async (directory) => {
    const keyPath = path.join(directory, "id_private");
    await writeFile(keyPath, privateKey, { mode: 0o600 });
    let stdout: string;
    try {
      ({ stdout } = await execFileAsync("ssh-keygen", ["-y", "-P", "", "-f", keyPath]));
    } catch {
      throw new Error(
        "SSH private key is invalid or passphrase-protected; SAWS host keys must not require a passphrase",
      );
    }
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

const execFileAsync = promisify(execFile);

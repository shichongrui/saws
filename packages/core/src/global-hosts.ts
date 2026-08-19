import fs from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Host, type HostConfig, hostSshPrivateKeySecretName } from "./Host.js";
import { SecretsManager } from "./secrets-manager.js";

const GLOBAL_HOST_PROFILE_VERSION = 1;
const managers = new Map<string, SecretsManager>();

export type GlobalHostConfig = Omit<HostConfig, "sshPrivateKey" | "dryRun">;

interface StoredGlobalHost extends GlobalHostConfig {
  version: typeof GLOBAL_HOST_PROFILE_VERSION;
}

export function getSawsHome() {
  const configuredHome = process.env.SAWS_HOME;
  if (configuredHome != null && configuredHome.trim().length === 0) {
    throw new Error("SAWS_HOME cannot be empty");
  }
  return path.resolve(configuredHome ?? path.join(os.homedir(), ".saws"));
}

export function getGlobalHost(name: string) {
  const normalizedName = requireGlobalHostName(name);
  const profilePath = getGlobalHostProfilePath(normalizedName);
  let contents: string;
  try {
    contents = fs.readFileSync(profilePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        `Global host "${normalizedName}" is not configured. Run: saws host create ${normalizedName}`,
      );
    }
    throw error;
  }

  const profile = parseGlobalHost(contents, profilePath);
  if (profile.name !== normalizedName) {
    throw new Error(
      `Global host profile ${profilePath} declares name "${profile.name}" instead of "${normalizedName}"`,
    );
  }
  return createHost(profile);
}

export async function createGlobalHost(config: GlobalHostConfig) {
  const host = createHost({
    ...config,
    name: requireGlobalHostName(config.name),
  });
  const profile = toStoredGlobalHost(host);
  const profilePath = getGlobalHostProfilePath(host.name);
  await mkdir(path.dirname(profilePath), { recursive: true });
  try {
    await writeFile(profilePath, `${JSON.stringify(profile, null, 2)}\n`, { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(`Global host "${host.name}" is already configured`);
    }
    throw error;
  }
  return host;
}

export function getGlobalHostSecretsManager() {
  const sawsHome = getSawsHome();
  let manager = managers.get(sawsHome);
  if (manager == null) {
    manager = new SecretsManager({
      rootDir: sawsHome,
      sawsDirectory: sawsHome,
    });
    managers.set(sawsHome, manager);
  }
  return manager;
}

export function getGlobalHostProfilePath(name: string) {
  return path.join(getSawsHome(), "hosts", requireGlobalHostName(name), "host.json");
}

function createHost(config: GlobalHostConfig) {
  const manager = getGlobalHostSecretsManager();
  return new Host({
    ...config,
    sshPrivateKey: manager.global.reference(hostSshPrivateKeySecretName(config.name)),
  });
}

function toStoredGlobalHost(host: Host): StoredGlobalHost {
  return {
    version: GLOBAL_HOST_PROFILE_VERSION,
    name: host.name,
    address: host.address,
    user: host.user,
    sshPort: host.sshPort,
    exposure: host.exposure,
    allowedTcpPorts: host.allowedTcpPorts,
    ...(host.platform == null ? {} : { platform: host.platform }),
  };
}

function parseGlobalHost(contents: string, profilePath: string): StoredGlobalHost {
  let value: unknown;
  try {
    value = JSON.parse(contents);
  } catch {
    throw new Error(`Global host profile ${profilePath} is not valid JSON`);
  }
  if (value == null || typeof value !== "object") {
    throw new Error(`Global host profile ${profilePath} must contain an object`);
  }

  const profile = value as Partial<StoredGlobalHost>;
  if (profile.version !== GLOBAL_HOST_PROFILE_VERSION) {
    throw new Error(`Global host profile ${profilePath} has an unsupported version`);
  }
  if (typeof profile.name !== "string") {
    throw new Error(`Global host profile ${profilePath} must contain a name`);
  }

  try {
    const host = createHost(profile as GlobalHostConfig);
    return toStoredGlobalHost(host);
  } catch (error) {
    throw new Error(`Global host profile ${profilePath} is invalid: ${(error as Error).message}`);
  }
}

function requireGlobalHostName(name: string) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name)) {
    throw new Error(
      "Global host name must start with a letter or number and contain only letters, numbers, dots, underscores, or hyphens",
    );
  }
  return name;
}

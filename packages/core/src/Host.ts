import { execFile, spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { SecretReference } from "./secrets-manager.js";
import { shellQuote as quoteShell } from "./utils/shell-quote.js";
import {
  type HostExposure,
  readinessCheckScript,
  readinessConfigureScript,
} from "./host-readiness.js";

export type HostPlatform = `${string}/${string}` | `${string}/${string}/${string}`;

export interface HostConfig {
  name: string;
  address: string;
  /** Persistent account used for normal deployment operations. */
  user: string;
  /** Global encrypted secret containing this host's Ed25519 private key. */
  sshPrivateKey?: SecretReference;
  sshPort?: number;
  /**
   * How applications on this host are reached. Tunnel mode permits no public
   * application ports; public mode permits allowedTcpPorts.
   */
  exposure?: HostExposure;
  /** Public TCP ports permitted in addition to SSH. Defaults to 80/443. */
  allowedTcpPorts?: number[];
  /** Docker image platform to build for this host, such as "linux/amd64". */
  platform?: HostPlatform;
  dryRun?: boolean;
}

export interface HostExecOptions {
  dryRun?: boolean;
  /** Bytes written to the remote command's standard input. Never logged. */
  input?: string;
}

export interface ConfigureHostOptions {
  /** Existing account used only to bootstrap the deployment account. */
  bootstrapUser: string;
  deploymentPublicKey: string;
  dryRun?: boolean;
}

export class Host {
  readonly name: string;
  readonly address: string;
  readonly user: string;
  readonly sshPrivateKey?: SecretReference;
  readonly sshPort: number;
  readonly exposure: HostExposure;
  readonly allowedTcpPorts: number[];
  readonly platform?: HostPlatform;
  readonly dryRun: boolean;
  private readinessVerified = false;

  constructor(config: HostConfig) {
    this.name = requireNonempty(config.name, "Host name");
    this.address = requireNonempty(config.address, "Host address");
    this.user = requireDeploymentUser(config.user);
    if (config.sshPrivateKey != null && config.sshPrivateKey.scope !== "global") {
      throw new Error(`Host "${this.name}" sshPrivateKey must reference a global secret`);
    }
    this.sshPrivateKey = config.sshPrivateKey;
    this.sshPort = config.sshPort ?? 22;
    if (!Number.isInteger(this.sshPort) || this.sshPort < 1 || this.sshPort > 65_535) {
      throw new Error("sshPort must be a valid TCP port");
    }
    this.exposure = config.exposure ?? "tunnel";
    if (this.exposure !== "tunnel" && this.exposure !== "public") {
      throw new Error('exposure must be either "tunnel" or "public"');
    }
    this.allowedTcpPorts = uniquePorts(
      config.allowedTcpPorts ?? (this.exposure === "public" ? [80, 443] : []),
    );
    if (this.exposure === "tunnel" && this.allowedTcpPorts.length > 0) {
      throw new Error(`Host "${config.name}" cannot allow public TCP ports in tunnel mode`);
    }
    this.platform =
      config.platform == null ? undefined : requireDockerPlatform(config.platform, "Host platform");
    this.dryRun = config.dryRun ?? false;
  }

  get sshTarget() {
    return `${this.user}@${this.address}`;
  }

  async exec(command: string, options: HostExecOptions = {}) {
    if (options.dryRun || this.dryRun) {
      console.log(`[dry-run:${this.name}] ssh ${this.sshTarget} ${command}`);
      return;
    }

    await this.withPrivateKey((keyPath) =>
      run("ssh", [...this.sshArgs("ssh", keyPath), this.sshTarget, command], {
        input: options.input,
      }),
    );
  }

  async copyFile(localPath: string, remotePath: string, options: { dryRun?: boolean } = {}) {
    if (options.dryRun || this.dryRun) {
      console.log(`[dry-run:${this.name}] scp ${localPath} ${this.sshTarget}:${remotePath}`);
      return;
    }

    await this.withPrivateKey((keyPath) =>
      run("scp", [...this.sshArgs("scp", keyPath), localPath, `${this.sshTarget}:${remotePath}`]),
    );
  }

  shellQuote(value: string) {
    return quoteShell(value);
  }

  async assertReady(options: { dryRun?: boolean } = {}) {
    if (this.readinessVerified) return;
    const deploymentPublicKey =
      options.dryRun || this.dryRun ? "" : await this.getDeploymentPublicKey();
    await this.exec(
      readinessCheckScript({
        ...this.readinessConfig,
        deploymentPublicKey,
      }),
      options,
    );
    if (!options.dryRun && !this.dryRun) this.readinessVerified = true;
  }

  async configure(options: ConfigureHostOptions) {
    const bootstrapUser = requireLinuxUser(options.bootstrapUser, "Bootstrap user");
    const deploymentPublicKey = requireNonempty(
      options.deploymentPublicKey,
      "Deployment public key",
    );
    const bootstrapTarget = `${bootstrapUser}@${this.address}`;
    if (options.dryRun || this.dryRun) {
      console.log(
        `[dry-run:${this.name}] configure ${bootstrapTarget} for deployment user ${this.user}`,
      );
      return;
    }

    const script = readinessConfigureScript({
      ...this.readinessConfig,
      deploymentPublicKey,
    });
    const command =
      bootstrapUser === "root"
        ? `sh -eu -c ${this.shellQuote(script)}`
        : `sudo sh -eu -c ${this.shellQuote(script)}`;
    await run(
      "ssh",
      [
        ...(bootstrapUser === "root" ? [] : ["-tt"]),
        ...this.sshArgs("ssh"),
        bootstrapTarget,
        command,
      ],
      { sensitiveArgs: true },
    );
    this.readinessVerified = false;
  }

  private get readinessConfig() {
    return {
      name: this.name,
      deploymentUser: this.user,
      deploymentPublicKey: "",
      exposure: this.exposure,
      sshPort: this.sshPort,
      allowedTcpPorts: this.allowedTcpPorts,
    };
  }

  private sshArgs(command: "ssh" | "scp" = "ssh", keyPath?: string) {
    const portFlag = command === "scp" ? "-P" : "-p";
    return [
      ...(keyPath == null
        ? []
        : ["-i", keyPath, "-o", "BatchMode=yes", "-o", "IdentitiesOnly=yes"]),
      portFlag,
      String(this.sshPort),
    ];
  }

  private async withPrivateKey<T>(callback: (keyPath: string) => Promise<T>) {
    if (this.sshPrivateKey == null) {
      throw new Error(`Host "${this.name}" does not have a global SSH private-key reference`);
    }

    const directory = await mkdtemp(path.join(tmpdir(), "saws-host-"));
    const keyPath = path.join(directory, "id_ed25519");
    try {
      const privateKey = await this.sshPrivateKey.resolve();
      await writeFile(keyPath, privateKey, { mode: 0o600 });
      return await callback(keyPath);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  private async getDeploymentPublicKey() {
    return this.withPrivateKey(async (keyPath) => {
      const { stdout } = await execFileAsync("ssh-keygen", ["-y", "-f", keyPath]);
      return requireNonempty(stdout.trim(), "Derived deployment public key");
    });
  }
}

export function hostSshPrivateKeySecretName(hostName: string) {
  return `host-${requireNonempty(hostName, "Host name")}-ssh-private-key`;
}

export function hostSshPublicKeyEnvName(hostName: string) {
  const normalized = requireNonempty(hostName, "Host name")
    .replaceAll(/[^a-zA-Z0-9]/g, "_")
    .toUpperCase();
  return `SAWS_HOST_${normalized}_SSH_PUBLIC_KEY`;
}

function uniquePorts(ports: number[]) {
  return [
    ...new Set(
      ports.map((port) => {
        if (!Number.isInteger(port) || port < 1 || port > 65_535) {
          throw new Error("allowedTcpPorts must contain valid TCP ports");
        }
        return port;
      }),
    ),
  ].sort((left, right) => left - right);
}

async function run(
  command: string,
  args: string[],
  options: { input?: string; sensitiveArgs?: boolean } = {},
) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: options.input == null ? "inherit" : ["pipe", "inherit", "inherit"],
    });

    if (options.input != null) {
      child.stdin?.end(options.input);
    }
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          options.sensitiveArgs
            ? `${command} host configuration exited with code ${code}`
            : `${command} exited with code ${code}`,
        ),
      );
    });
  });
}

function requireNonempty(value: string, label: string) {
  if (value.trim().length === 0) throw new Error(`${label} cannot be empty`);
  return value;
}

function requireDeploymentUser(user: string) {
  return requireLinuxUser(user, "Host deployment user");
}

function requireLinuxUser(user: string, label: string) {
  requireNonempty(user, label);
  if (!/^[a-z_][a-z0-9_-]*[$]?$/i.test(user)) {
    throw new Error(`${label} is not a valid Linux username`);
  }
  return user;
}

function requireDockerPlatform(platform: HostPlatform, label: string) {
  requireNonempty(platform, label);
  if (
    !/^[a-z0-9]+(?:[._-][a-z0-9]+)*\/[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)?$/.test(
      platform,
    )
  ) {
    throw new Error(`${label} must be a Docker platform like "linux/amd64"`);
  }
  return platform;
}

const execFileAsync = promisify(execFile);

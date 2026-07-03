import { spawn } from "node:child_process";
import {
  type HostExposure,
  readinessCheckScript,
  readinessConfigureScript,
} from "./host-readiness.js";

export interface HostConfig {
  name: string;
  address: string;
  user?: string;
  sshKeyPath?: string;
  sshPort?: number;
  /**
   * How applications on this host are reached. Tunnel mode permits no public
   * application ports; public mode permits allowedTcpPorts.
   */
  exposure?: HostExposure;
  /** Public TCP ports permitted in addition to SSH. Defaults to 80/443. */
  allowedTcpPorts?: number[];
  dryRun?: boolean;
}

export interface HostExecOptions {
  dryRun?: boolean;
  /** Bytes written to the remote command's standard input. Never logged. */
  input?: string;
}

export class Host {
  readonly name: string;
  readonly address: string;
  readonly user: string;
  readonly sshKeyPath?: string;
  readonly sshPort: number;
  readonly exposure: HostExposure;
  readonly allowedTcpPorts: number[];
  readonly dryRun: boolean;
  private readinessVerified = false;

  constructor(config: HostConfig) {
    this.name = config.name;
    this.address = config.address;
    this.user = config.user ?? "root";
    this.sshKeyPath = config.sshKeyPath;
    this.sshPort = config.sshPort ?? 22;
    if (
      !Number.isInteger(this.sshPort) ||
      this.sshPort < 1 ||
      this.sshPort > 65_535
    ) {
      throw new Error("sshPort must be a valid TCP port");
    }
    this.exposure = config.exposure ?? "tunnel";
    if (this.exposure !== "tunnel" && this.exposure !== "public") {
      throw new Error('exposure must be either "tunnel" or "public"');
    }
    this.allowedTcpPorts = uniquePorts(
      config.allowedTcpPorts ?? (this.exposure === "public" ? [80, 443] : [])
    );
    if (this.exposure === "tunnel" && this.allowedTcpPorts.length > 0) {
      throw new Error(
        `Host "${config.name}" cannot allow public TCP ports in tunnel mode`
      );
    }
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

    await run("ssh", [...this.sshArgs(), this.sshTarget, command], {
      input: options.input,
    });
  }

  async copyFile(
    localPath: string,
    remotePath: string,
    options: { dryRun?: boolean } = {}
  ) {
    if (options.dryRun || this.dryRun) {
      console.log(`[dry-run:${this.name}] scp ${localPath} ${this.sshTarget}:${remotePath}`);
      return;
    }

    await run("scp", [
      ...this.sshArgs("scp"),
      localPath,
      `${this.sshTarget}:${remotePath}`,
    ]);
  }

  shellQuote(value: string) {
    return `'${value.replaceAll("'", "'\\''")}'`;
  }

  async assertReady(options: { dryRun?: boolean } = {}) {
    if (this.readinessVerified) return;
    await this.exec(readinessCheckScript(this.readinessConfig), options);
    this.readinessVerified = true;
  }

  async configure(options: { dryRun?: boolean } = {}) {
    const script = readinessConfigureScript(this.readinessConfig);
    const command = this.user === "root"
      ? `sh -eu -c ${this.shellQuote(script)}`
      : `sudo -n sh -eu -c ${this.shellQuote(script)}`;
    await this.exec(command, options);
    this.readinessVerified = false;
  }

  private get readinessConfig() {
    return {
      name: this.name,
      deploymentUser: this.user,
      exposure: this.exposure,
      sshPort: this.sshPort,
      allowedTcpPorts: this.allowedTcpPorts,
    };
  }

  private sshArgs(command: "ssh" | "scp" = "ssh") {
    const portFlag = command === "scp" ? "-P" : "-p";
    return [
      ...(this.sshKeyPath == null ? [] : ["-i", this.sshKeyPath]),
      portFlag,
      String(this.sshPort),
    ];
  }
}

function uniquePorts(ports: number[]) {
  return [...new Set(ports.map((port) => {
    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
      throw new Error("allowedTcpPorts must contain valid TCP ports");
    }
    return port;
  }))].sort((left, right) => left - right);
}

async function run(
  command: string,
  args: string[],
  options: { input?: string } = {}
) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: options.input == null
        ? "inherit"
        : ["pipe", "inherit", "inherit"],
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

      reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

import { spawn } from "node:child_process";
import { readinessCheckScript, readinessConfigureScript, } from "./host-readiness.js";
export class Host {
    name;
    address;
    user;
    sshKeyPath;
    sshPort;
    exposure;
    allowedTcpPorts;
    dryRun;
    readinessVerified = false;
    constructor(config) {
        this.name = config.name;
        this.address = config.address;
        this.user = config.user ?? "root";
        this.sshKeyPath = config.sshKeyPath;
        this.sshPort = config.sshPort ?? 22;
        if (!Number.isInteger(this.sshPort) ||
            this.sshPort < 1 ||
            this.sshPort > 65_535) {
            throw new Error("sshPort must be a valid TCP port");
        }
        this.exposure = config.exposure ?? "tunnel";
        if (this.exposure !== "tunnel" && this.exposure !== "public") {
            throw new Error('exposure must be either "tunnel" or "public"');
        }
        this.allowedTcpPorts = uniquePorts(config.allowedTcpPorts ?? (this.exposure === "public" ? [80, 443] : []));
        if (this.exposure === "tunnel" && this.allowedTcpPorts.length > 0) {
            throw new Error(`Host "${config.name}" cannot allow public TCP ports in tunnel mode`);
        }
        this.dryRun = config.dryRun ?? false;
    }
    get sshTarget() {
        return `${this.user}@${this.address}`;
    }
    async exec(command, options = {}) {
        if (options.dryRun || this.dryRun) {
            console.log(`[dry-run:${this.name}] ssh ${this.sshTarget} ${command}`);
            return;
        }
        await run("ssh", [...this.sshArgs(), this.sshTarget, command], {
            input: options.input,
        });
    }
    async copyFile(localPath, remotePath, options = {}) {
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
    shellQuote(value) {
        return `'${value.replaceAll("'", "'\\''")}'`;
    }
    async assertReady(options = {}) {
        if (this.readinessVerified)
            return;
        await this.exec(readinessCheckScript(this.readinessConfig), options);
        this.readinessVerified = true;
    }
    async configure(options = {}) {
        const script = readinessConfigureScript(this.readinessConfig);
        const command = this.user === "root"
            ? `sh -eu -c ${this.shellQuote(script)}`
            : `sudo -n sh -eu -c ${this.shellQuote(script)}`;
        await this.exec(command, options);
        this.readinessVerified = false;
    }
    get readinessConfig() {
        return {
            name: this.name,
            deploymentUser: this.user,
            exposure: this.exposure,
            sshPort: this.sshPort,
            allowedTcpPorts: this.allowedTcpPorts,
        };
    }
    sshArgs(command = "ssh") {
        const portFlag = command === "scp" ? "-P" : "-p";
        return [
            ...(this.sshKeyPath == null ? [] : ["-i", this.sshKeyPath]),
            portFlag,
            String(this.sshPort),
        ];
    }
}
function uniquePorts(ports) {
    return [...new Set(ports.map((port) => {
            if (!Number.isInteger(port) || port < 1 || port > 65_535) {
                throw new Error("allowedTcpPorts must contain valid TCP ports");
            }
            return port;
        }))].sort((left, right) => left - right);
}
async function run(command, args, options = {}) {
    await new Promise((resolve, reject) => {
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

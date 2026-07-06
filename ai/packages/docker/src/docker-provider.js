import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { DeployContext, } from "@saws/core";
import { SecretReference } from "@saws/secrets";
export class DockerProvider {
    host;
    appDirectory;
    network;
    registry;
    auth;
    locallyAuthenticatedContexts = new WeakSet();
    remotelyAuthenticatedContexts = new WeakSet();
    constructor(config) {
        this.host = config.host;
        this.appDirectory = config.appDirectory ?? "/opt/saws";
        this.network = config.network ?? "saws";
        this.registry = config.registry?.replace(/\/+$/, "");
        this.auth = config.auth;
        if (config.registry != null && this.registry?.length === 0) {
            throw new Error("DockerProvider registry cannot be empty");
        }
        if (this.registry != null && this.auth == null) {
            throw new Error("DockerProvider auth is required when registry is configured");
        }
        if (this.registry == null && this.auth != null) {
            throw new Error("DockerProvider registry is required when auth is configured");
        }
        if (this.auth != null) {
            if (this.auth.username.trim().length === 0) {
                throw new Error("DockerProvider registry auth username cannot be empty");
            }
            if (!(this.auth.password instanceof SecretReference)) {
                throw new Error("DockerProvider registry auth password must be a SecretsManager reference");
            }
        }
    }
    getNetwork(context) {
        return `${this.network}-${context.stage}`;
    }
    getAppDirectory(context) {
        return path.posix.join(this.appDirectory, context.stage);
    }
    getBuiltImageName(context, serviceName) {
        const repository = `${context.stage}-${serviceName}`
            .toLowerCase()
            .replace(/[^a-z0-9._-]+/g, "-")
            .replace(/^[._-]+|[._-]+$/g, "");
        if (repository.length === 0) {
            throw new Error(`Cannot derive a Docker image name for service "${serviceName}"`);
        }
        if (context instanceof DeployContext) {
            if (this.registry == null || this.registry.length === 0) {
                throw new Error(`Docker service "${serviceName}" uses a Dockerfile, but its DockerProvider has no registry configured`);
            }
            return `${this.registry}/${repository}:latest`;
        }
        return `saws-${repository}:latest`;
    }
    async buildImage(context, config) {
        const dockerfile = path.resolve(context.rootDir, config.dockerfile);
        const buildContext = path.resolve(context.rootDir, config.context ?? path.dirname(config.dockerfile));
        await runLocal([
            "docker build",
            `-f ${this.host.shellQuote(dockerfile)}`,
            `-t ${this.host.shellQuote(config.image)}`,
            this.host.shellQuote(buildContext),
        ].join(" "), { dryRun: context.dryRun, context });
    }
    async pushImage(context, image) {
        await this.authenticateLocalRegistry(context);
        await runLocal(`docker push ${this.host.shellQuote(image)}`, {
            dryRun: context.dryRun,
            context,
        });
    }
    async prepare(context, network = this.getNetwork(context)) {
        await this.authenticateRemoteRegistry(context);
        await this.host.exec(`mkdir -p ${this.host.shellQuote(this.getAppDirectory(context))}`, { dryRun: context.dryRun });
        await this.host.exec(`docker network inspect ${this.host.shellQuote(network)} >/dev/null 2>&1 || docker network create ${this.host.shellQuote(network)}`, { dryRun: context.dryRun });
    }
    async assertHostReady(context) {
        await this.host.assertReady({ dryRun: context.dryRun });
    }
    async authenticateLocalRegistry(context) {
        if (this.registry == null ||
            this.auth == null ||
            this.locallyAuthenticatedContexts.has(context)) {
            return;
        }
        const password = await this.auth.password.resolve(context);
        await runLocal([
            "docker login",
            this.host.shellQuote(this.getRegistryServer()),
            `--username ${this.host.shellQuote(this.auth.username)}`,
            "--password-stdin",
        ].join(" "), {
            dryRun: context.dryRun,
            context,
            input: `${password}\n`,
        });
        this.locallyAuthenticatedContexts.add(context);
    }
    async authenticateRemoteRegistry(context) {
        if (this.registry == null ||
            this.auth == null ||
            this.remotelyAuthenticatedContexts.has(context)) {
            return;
        }
        const password = await this.auth.password.resolve(context);
        await this.host.exec([
            "docker login",
            this.host.shellQuote(this.getRegistryServer()),
            `--username ${this.host.shellQuote(this.auth.username)}`,
            "--password-stdin",
        ].join(" "), {
            dryRun: context.dryRun,
            input: `${password}\n`,
        });
        this.remotelyAuthenticatedContexts.add(context);
    }
    getRegistryServer() {
        return this.registry.split("/", 1)[0];
    }
    async runContainer(context, config) {
        const network = config.network ?? this.getNetwork(context);
        await this.prepare(context, network);
        const configHash = config.configHash ?? this.getContainerConfigHash({
            ...config,
            network,
        });
        const labels = {
            ...config.labels,
            "saws.configHash": configHash,
        };
        const envArgs = Object.entries(config.env ?? {})
            .map(([key, value]) => `-e ${this.host.shellQuote(`${key}=${value}`)}`)
            .join(" ");
        const envFileArgs = (config.envFiles ?? [])
            .map((envFile) => `--env-file ${this.host.shellQuote(envFile)}`)
            .join(" ");
        const volumeArgs = (config.volumes ?? [])
            .map((volume) => `-v ${this.host.shellQuote(volume)}`)
            .join(" ");
        const portArgs = (config.ports ?? [])
            .map((port) => `-p ${this.host.shellQuote(port)}`)
            .join(" ");
        const labelArgs = Object.entries(labels)
            .map(([key, value]) => `--label ${this.host.shellQuote(`${key}=${value}`)}`)
            .join(" ");
        const healthCheckArgs = this.getDockerHealthCheckArgs(config.healthCheck)
            .map((argument) => argument.flagOnly
            ? argument.flag
            : `${argument.flag} ${this.host.shellQuote(argument.value)}`)
            .join(" ");
        const command = (config.command ?? [])
            .map((part) => this.host.shellQuote(part))
            .join(" ");
        if (config.pull !== false) {
            await this.host.exec(`docker pull ${this.host.shellQuote(config.image)}`, { dryRun: context.dryRun });
        }
        const containerName = this.host.shellQuote(config.name);
        const image = this.host.shellQuote(config.image);
        const runCommand = [
            "docker run -d",
            `--name ${containerName}`,
            `--network ${this.host.shellQuote(network)}`,
            `--restart ${this.host.shellQuote(config.restart ?? "unless-stopped")}`,
            envArgs,
            envFileArgs,
            volumeArgs,
            portArgs,
            labelArgs,
            healthCheckArgs,
            image,
            command,
        ]
            .filter(Boolean)
            .join(" ");
        const currentHash = `$(docker inspect --format ${this.host.shellQuote('{{index .Config.Labels "saws.configHash"}}')} ${containerName} 2>/dev/null || true)`;
        const currentImage = `$(docker inspect --format ${this.host.shellQuote("{{.Image}}")} ${containerName} 2>/dev/null || true)`;
        const desiredImage = `$(docker image inspect --format ${this.host.shellQuote("{{.Id}}")} ${image})`;
        const isRunning = `$(docker inspect --format ${this.host.shellQuote("{{.State.Running}}")} ${containerName} 2>/dev/null || true)`;
        await this.host.exec([
            `if [ "${currentHash}" = ${this.host.shellQuote(configHash)} ] && [ "${currentImage}" = "${desiredImage}" ]; then`,
            `if [ "${isRunning}" = "true" ]; then`,
            `echo ${this.host.shellQuote(`Container ${config.name} is unchanged`)}`,
            "else",
            `docker start ${containerName}`,
            "fi",
            "else",
            `docker rm -f ${containerName} >/dev/null 2>&1 || true`,
            runCommand,
            "fi",
        ].join("\n"), { dryRun: context.dryRun });
    }
    /**
     * Deploys an app behind a stable Nginx container. The inactive app slot is
     * made ready before a graceful proxy reload switches traffic to it.
     */
    async runBlueGreenContainer(context, config) {
        const network = config.app.network ?? this.getNetwork(context);
        await this.prepare(context, network);
        const proxyImage = config.proxyImage ?? "nginx:1.27-alpine";
        const proxyName = `${config.app.name}-proxy`;
        const blueName = `${config.app.name}-blue`;
        const greenName = `${config.app.name}-green`;
        const healthCheckPath = normalizeHttpPath(config.healthCheckPath ?? "/");
        const healthCheckTimeout = config.healthCheckTimeoutSeconds ?? 30;
        const drainTimeout = config.drainTimeoutSeconds ?? 30;
        const serviceName = config.app.labels?.["saws.service"] ?? config.app.name;
        const proxyDirectory = path.posix.join(this.getAppDirectory(context), serviceName, "proxy");
        const proxyConfigPath = path.posix.join(proxyDirectory, "nginx.conf");
        const nextProxyConfigPath = `${proxyConfigPath}.next`;
        const previousProxyConfigPath = `${proxyConfigPath}.previous`;
        const appConfigHash = config.app.configHash ?? this.getContainerConfigHash({
            ...config.app,
            network,
        });
        if (!Number.isInteger(config.appPort) || config.appPort < 1) {
            throw new Error("Blue/green appPort must be a positive integer");
        }
        if (!Number.isInteger(healthCheckTimeout) || healthCheckTimeout < 1) {
            throw new Error("Blue/green healthCheckTimeoutSeconds must be a positive integer");
        }
        if (!Number.isInteger(drainTimeout) || drainTimeout < 0) {
            throw new Error("Blue/green drainTimeoutSeconds must be a non-negative integer");
        }
        await this.host.exec(`mkdir -p ${this.host.shellQuote(proxyDirectory)}`, { dryRun: context.dryRun });
        if (config.app.pull !== false) {
            await this.host.exec(`docker pull ${this.host.shellQuote(config.app.image)}`, { dryRun: context.dryRun });
        }
        await this.host.exec(`docker pull ${this.host.shellQuote(proxyImage)}`, { dryRun: context.dryRun });
        const appRunCommand = (slotName) => this.getDockerRunCommand({
            ...config.app,
            name: slotName,
            network,
            ports: [],
            labels: {
                ...config.app.labels,
                "saws.configHash": appConfigHash,
                "saws.deploymentSlot": slotName.endsWith("-blue") ? "blue" : "green",
            },
        });
        const proxyPortArgs = config.proxyPorts
            .map((port) => `-p ${this.host.shellQuote(port)}`)
            .join(" ");
        const proxyConfigHash = createHash("sha256")
            .update(JSON.stringify({
            network,
            image: proxyImage,
            ports: [...config.proxyPorts].sort(),
            configPath: proxyConfigPath,
            restart: config.app.restart ?? "unless-stopped",
            appPort: config.appPort,
            healthCheckPath,
            healthCheckTimeout,
        }))
            .digest("hex");
        const proxyLabelArgs = Object.entries({
            "saws.service": serviceName,
            "saws.serviceType": "hono-http-proxy",
            "saws.stage": config.app.labels?.["saws.stage"] ?? context.stage,
            "saws.configHash": proxyConfigHash,
        })
            .map(([key, value]) => `--label ${this.host.shellQuote(`${key}=${value}`)}`)
            .join(" ");
        const proxyHealthCheckArgs = this.getDockerHealthCheckArgs({
            command: [
                "wget -q -T 1 -O /dev/null",
                quotePosixShell(`http://127.0.0.1:${config.appPort}${healthCheckPath}`),
            ].join(" "),
            interval: "10s",
            timeout: "5s",
            retries: 3,
            startPeriod: `${healthCheckTimeout}s`,
        })
            .map((argument) => argument.flagOnly
            ? argument.flag
            : `${argument.flag} ${this.host.shellQuote(argument.value)}`)
            .join(" ");
        const proxyRunCommand = [
            "docker run -d",
            `--name ${this.host.shellQuote(proxyName)}`,
            `--network ${this.host.shellQuote(network)}`,
            `--restart ${this.host.shellQuote(config.app.restart ?? "unless-stopped")}`,
            proxyPortArgs,
            proxyLabelArgs,
            proxyHealthCheckArgs,
            `-v ${this.host.shellQuote(`${proxyConfigPath}:/etc/nginx/nginx.conf:ro`)}`,
            this.host.shellQuote(proxyImage),
        ].filter(Boolean).join(" ");
        const blueConfig = nginxProxyConfig(blueName, config.appPort, drainTimeout);
        const greenConfig = nginxProxyConfig(greenName, config.appPort, drainTimeout);
        await this.host.exec([
            `proxy=${this.host.shellQuote(proxyName)}`,
            `blue=${this.host.shellQuote(blueName)}`,
            `green=${this.host.shellQuote(greenName)}`,
            `config=${this.host.shellQuote(proxyConfigPath)}`,
            `next_config=${this.host.shellQuote(nextProxyConfigPath)}`,
            `previous_config=${this.host.shellQuote(previousProxyConfigPath)}`,
            `active=$(sed -n 's/^# saws.activeSlot=//p' "$config" 2>/dev/null || true)`,
            'if [ -z "$active" ]; then',
            'if docker inspect "$blue" >/dev/null 2>&1; then',
            'active="blue"',
            'elif docker inspect "$green" >/dev/null 2>&1; then',
            'active="green"',
            "fi",
            "fi",
            'if [ "$active" = "blue" ]; then',
            'next_container="$green"',
            'old_container="$blue"',
            `next_contents=${this.host.shellQuote(greenConfig)}`,
            `app_run=${this.host.shellQuote(appRunCommand(greenName))}`,
            "else",
            'next_container="$blue"',
            'old_container="$green"',
            `next_contents=${this.host.shellQuote(blueConfig)}`,
            `app_run=${this.host.shellQuote(appRunCommand(blueName))}`,
            "fi",
            'docker rm -f "$next_container" >/dev/null 2>&1 || true',
            'if ! eval "$app_run"; then',
            'docker rm -f "$next_container" >/dev/null 2>&1 || true',
            "exit 1",
            "fi",
            "ready=false",
            `attempt=0`,
            `while [ "$attempt" -lt ${healthCheckTimeout} ]; do`,
            `if docker run --rm --network ${this.host.shellQuote(network)} ${this.host.shellQuote(proxyImage)} wget -q -T 1 -O /dev/null "http://$next_container:${config.appPort}"${this.host.shellQuote(healthCheckPath)}; then`,
            "ready=true",
            "break",
            "fi",
            "attempt=$((attempt + 1))",
            "sleep 1",
            "done",
            'if [ "$ready" != "true" ]; then',
            'docker rm -f "$next_container" >/dev/null 2>&1 || true',
            'echo "Container $next_container did not become ready" >&2',
            "exit 1",
            "fi",
            'printf "%s" "$next_contents" > "$next_config"',
            `current_proxy_hash=$(docker inspect --format ${this.host.shellQuote('{{index .Config.Labels "saws.configHash"}}')} "$proxy" 2>/dev/null || true)`,
            `if [ "$current_proxy_hash" = ${this.host.shellQuote(proxyConfigHash)} ]; then`,
            'cp "$config" "$previous_config"',
            'cp "$next_config" "$config"',
            'rm -f "$next_config"',
            'docker start "$proxy" >/dev/null 2>&1 || true',
            'if ! docker exec "$proxy" nginx -t; then',
            'cp "$previous_config" "$config"',
            'rm -f "$previous_config"',
            'docker rm -f "$next_container" >/dev/null 2>&1 || true',
            "exit 1",
            "fi",
            'if ! docker exec "$proxy" nginx -s reload; then',
            'cp "$previous_config" "$config"',
            'docker exec "$proxy" nginx -s reload >/dev/null 2>&1 || true',
            'rm -f "$previous_config"',
            'docker rm -f "$next_container" >/dev/null 2>&1 || true',
            "exit 1",
            "fi",
            'rm -f "$previous_config"',
            "else",
            'mv "$next_config" "$config"',
            'docker rm -f "$proxy" >/dev/null 2>&1 || true',
            `if ! ${proxyRunCommand}; then`,
            'docker rm -f "$next_container" >/dev/null 2>&1 || true',
            "exit 1",
            "fi",
            "fi",
            drainTimeout === 0 ? ":" : `sleep ${drainTimeout}`,
            'docker rm -f "$old_container" >/dev/null 2>&1 || true',
        ].join("\n"), { dryRun: context.dryRun });
    }
    getContainerConfigHash(config) {
        const labels = { ...config.labels };
        delete labels["saws.configHash"];
        const desiredConfig = {
            name: config.name,
            image: config.image,
            network: config.network ?? this.network,
            environment: sortRecord(config.env),
            envFiles: [...(config.envFiles ?? [])].sort(),
            volumes: [...(config.volumes ?? [])].sort(),
            ports: [...(config.ports ?? [])].sort(),
            command: config.command ?? [],
            labels: sortRecord(labels),
            restart: config.restart ?? "unless-stopped",
            healthCheck: config.healthCheck === false
                ? false
                : config.healthCheck == null
                    ? null
                    : {
                        command: config.healthCheck.command,
                        interval: config.healthCheck.interval,
                        timeout: config.healthCheck.timeout,
                        retries: config.healthCheck.retries,
                        startPeriod: config.healthCheck.startPeriod,
                    },
        };
        return createHash("sha256")
            .update(JSON.stringify(desiredConfig))
            .digest("hex");
    }
    async prepareLocal(context, network = this.getNetwork(context)) {
        await runLocal(`docker network inspect ${this.host.shellQuote(network)} >/dev/null 2>&1 || docker network create ${this.host.shellQuote(network)}`, { dryRun: context.dryRun, context });
    }
    async runLocalContainer(context, config) {
        const network = config.network ?? this.getNetwork(context);
        await this.prepareLocal(context, network);
        const envArgs = Object.entries(config.env ?? {})
            .map(([key, value]) => `-e ${this.host.shellQuote(`${key}=${value}`)}`)
            .join(" ");
        const envFileArgs = (config.envFiles ?? [])
            .map((envFile) => `--env-file ${this.host.shellQuote(envFile)}`)
            .join(" ");
        const volumeArgs = (config.volumes ?? [])
            .map((volume) => `-v ${this.host.shellQuote(volume)}`)
            .join(" ");
        const portArgs = (config.ports ?? [])
            .map((port) => `-p ${this.host.shellQuote(port)}`)
            .join(" ");
        const labelArgs = Object.entries(config.labels ?? {})
            .map(([key, value]) => `--label ${this.host.shellQuote(`${key}=${value}`)}`)
            .join(" ");
        const healthCheckArgs = this.getDockerHealthCheckArgs(config.healthCheck)
            .map((argument) => argument.flagOnly
            ? argument.flag
            : `${argument.flag} ${this.host.shellQuote(argument.value)}`)
            .join(" ");
        const command = (config.command ?? [])
            .map((part) => this.host.shellQuote(part))
            .join(" ");
        if (config.pull !== false) {
            await runLocal(`docker pull ${this.host.shellQuote(config.image)}`, {
                dryRun: context.dryRun,
                context,
            });
        }
        await runLocal(`docker rm -f ${this.host.shellQuote(config.name)} >/dev/null 2>&1 || true`, { dryRun: context.dryRun, context });
        await runLocal([
            "docker run -d",
            `--name ${this.host.shellQuote(config.name)}`,
            `--network ${this.host.shellQuote(network)}`,
            `--restart ${this.host.shellQuote(config.restart ?? "unless-stopped")}`,
            envArgs,
            envFileArgs,
            volumeArgs,
            portArgs,
            labelArgs,
            healthCheckArgs,
            this.host.shellQuote(config.image),
            command,
        ]
            .filter(Boolean)
            .join(" "), { dryRun: context.dryRun, context });
    }
    async startLocalContainer(context, config) {
        const network = config.network ?? this.getNetwork(context);
        await this.prepareLocal(context, network);
        if (config.pull !== false) {
            await runLocal(`docker pull ${this.host.shellQuote(config.image)}`, {
                dryRun: context.dryRun,
                context,
            });
        }
        await runLocal(`docker rm -f ${this.host.shellQuote(config.name)} >/dev/null 2>&1 || true`, { dryRun: context.dryRun, context });
        const args = [
            "run",
            "--name",
            config.name,
            "--network",
            network,
            ...(config.env == null
                ? []
                : Object.entries(config.env).flatMap(([key, value]) => [
                    "-e",
                    `${key}=${value}`,
                ])),
            ...(config.envFiles ?? []).flatMap((envFile) => ["--env-file", envFile]),
            ...(config.volumes ?? []).flatMap((volume) => ["-v", volume]),
            ...(config.ports ?? []).flatMap((port) => ["-p", port]),
            ...Object.entries(config.labels ?? {}).flatMap(([key, value]) => [
                "--label",
                `${key}=${value}`,
            ]),
            ...this.getDockerHealthCheckArgs(config.healthCheck).flatMap((argument) => argument.flagOnly ? [argument.flag] : [argument.flag, argument.value]),
            config.image,
            ...(config.command ?? []),
        ];
        if (context.dryRun) {
            context.writeLog(`[dry-run:local] docker ${args.map((arg) => this.host.shellQuote(arg)).join(" ")}\n`);
            return spawn(process.execPath, ["-e", ""], {
                stdio: "ignore",
            });
        }
        const child = spawn("docker", args, {
            stdio: context.logSink == null ? "inherit" : ["ignore", "pipe", "pipe"],
        });
        child.stdout?.on("data", (chunk) => {
            context.writeLog(chunk.toString("utf8"), "stdout");
        });
        child.stderr?.on("data", (chunk) => {
            context.writeLog(chunk.toString("utf8"), "stderr");
        });
        return child;
    }
    async writeRuntimeFile(context, relativePath, contents) {
        const localDir = path.resolve(context.rootDir, ".saws", "hosts", this.host.name, context.stage);
        await mkdir(localDir, { recursive: true });
        const localPath = path.join(localDir, relativePath);
        await mkdir(path.dirname(localPath), { recursive: true });
        await writeFile(localPath, contents);
        const remotePath = path.posix.join(this.getAppDirectory(context), relativePath);
        await this.host.exec(`mkdir -p ${this.host.shellQuote(path.posix.dirname(remotePath))}`, { dryRun: context.dryRun });
        await this.host.copyFile(localPath, remotePath, { dryRun: context.dryRun });
        return { localPath, remotePath };
    }
    async removeRuntimeFile(context, runtimeFile) {
        await rm(runtimeFile.localPath, { force: true });
        await this.host.exec(`rm -f ${this.host.shellQuote(runtimeFile.remotePath)}`, { dryRun: context.dryRun });
    }
    async writeLocalRuntimeFile(context, relativePath, contents) {
        const localPath = path.resolve(context.rootDir, ".saws", "local", context.stage, relativePath);
        await mkdir(path.dirname(localPath), { recursive: true });
        await writeFile(localPath, contents);
        return localPath;
    }
    async removeLocalRuntimeFile(localPath) {
        await rm(localPath, { force: true });
    }
    getDockerRunCommand(config) {
        const envArgs = Object.entries(config.env ?? {})
            .map(([key, value]) => `-e ${this.host.shellQuote(`${key}=${value}`)}`)
            .join(" ");
        const envFileArgs = (config.envFiles ?? [])
            .map((envFile) => `--env-file ${this.host.shellQuote(envFile)}`)
            .join(" ");
        const volumeArgs = (config.volumes ?? [])
            .map((volume) => `-v ${this.host.shellQuote(volume)}`)
            .join(" ");
        const portArgs = (config.ports ?? [])
            .map((port) => `-p ${this.host.shellQuote(port)}`)
            .join(" ");
        const labelArgs = Object.entries(config.labels ?? {})
            .map(([key, value]) => `--label ${this.host.shellQuote(`${key}=${value}`)}`)
            .join(" ");
        const healthCheckArgs = this.getDockerHealthCheckArgs(config.healthCheck)
            .map((argument) => argument.flagOnly
            ? argument.flag
            : `${argument.flag} ${this.host.shellQuote(argument.value)}`)
            .join(" ");
        const command = (config.command ?? [])
            .map((part) => this.host.shellQuote(part))
            .join(" ");
        return [
            "docker run -d",
            `--name ${this.host.shellQuote(config.name)}`,
            `--network ${this.host.shellQuote(config.network ?? this.network)}`,
            `--restart ${this.host.shellQuote(config.restart ?? "unless-stopped")}`,
            envArgs,
            envFileArgs,
            volumeArgs,
            portArgs,
            labelArgs,
            healthCheckArgs,
            this.host.shellQuote(config.image),
            command,
        ].filter(Boolean).join(" ");
    }
    getDockerHealthCheckArgs(healthCheck) {
        if (healthCheck == null)
            return [];
        if (healthCheck === false) {
            return [{ flag: "--no-healthcheck", flagOnly: true }];
        }
        if (healthCheck.command.length === 0) {
            throw new Error("Docker health check command cannot be empty");
        }
        if (healthCheck.retries != null &&
            (!Number.isInteger(healthCheck.retries) || healthCheck.retries < 1)) {
            throw new Error("Docker health check retries must be a positive integer");
        }
        const args = [
            { flag: "--health-cmd", flagOnly: false, value: healthCheck.command },
        ];
        for (const [flag, value] of [
            ["--health-interval", healthCheck.interval],
            ["--health-timeout", healthCheck.timeout],
            ["--health-start-period", healthCheck.startPeriod],
        ]) {
            if (value != null) {
                if (!isDockerDuration(value)) {
                    throw new Error(`${flag.slice(2)} must be a positive Docker duration`);
                }
                args.push({ flag, flagOnly: false, value });
            }
        }
        if (healthCheck.retries != null) {
            args.push({
                flag: "--health-retries",
                flagOnly: false,
                value: String(healthCheck.retries),
            });
        }
        return args;
    }
}
function normalizeHttpPath(value) {
    if (!value.startsWith("/")) {
        throw new Error("Blue/green healthCheckPath must start with /");
    }
    if (/[\r\n]/.test(value)) {
        throw new Error("Blue/green healthCheckPath cannot contain a newline");
    }
    return value;
}
function nginxProxyConfig(upstreamContainer, upstreamPort, drainTimeoutSeconds) {
    const slot = upstreamContainer.endsWith("-blue") ? "blue" : "green";
    return `# saws.activeSlot=${slot}
events {}
http {
  worker_shutdown_timeout ${drainTimeoutSeconds}s;
  map $http_upgrade $connection_upgrade {
    default upgrade;
    "" "";
  }
  upstream saws_app {
    server ${upstreamContainer}:${upstreamPort};
    keepalive 32;
  }
  server {
    listen ${upstreamPort};
    location / {
      proxy_pass http://saws_app;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection $connection_upgrade;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
    }
  }
}
`;
}
function sortRecord(record) {
    return Object.fromEntries(Object.entries(record ?? {}).sort(([left], [right]) => left.localeCompare(right)));
}
function isDockerDuration(value) {
    if (!/^(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h))+$/.test(value)) {
        return false;
    }
    return [...value.matchAll(/(\d+(?:\.\d+)?)(?:ns|us|µs|ms|s|m|h)/g)]
        .some((match) => Number(match[1]) > 0);
}
function quotePosixShell(value) {
    return `'${value.replaceAll("'", "'\\''")}'`;
}
async function runLocal(command, options = {}) {
    if (options.dryRun) {
        if (options.context?.logSink == null) {
            console.log(`[dry-run:local] ${command}`);
        }
        else {
            options.context.writeLog(`[dry-run:local] ${command}\n`);
        }
        return;
    }
    await new Promise((resolve, reject) => {
        const captureOutput = options.context?.logSink != null;
        const child = spawn(command, {
            shell: true,
            stdio: [
                options.input == null ? "ignore" : "pipe",
                captureOutput ? "pipe" : "inherit",
                captureOutput ? "pipe" : "inherit",
            ],
        });
        if (options.input != null) {
            child.stdin?.end(options.input);
        }
        child.stdout?.on("data", (chunk) => {
            options.context?.writeLog(chunk.toString("utf8"), "stdout");
        });
        child.stderr?.on("data", (chunk) => {
            options.context?.writeLog(chunk.toString("utf8"), "stderr");
        });
        child.on("error", reject);
        child.on("exit", (code) => {
            if (code === 0) {
                resolve();
                return;
            }
            reject(new Error(`local command exited with code ${code}: ${command}`));
        });
    });
}

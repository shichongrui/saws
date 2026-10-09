import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { ServiceDefinition } from "@saws/core";
import { createFileIfNotExists } from "@saws/core/utils/create-file-if-not-exists";
import { hasDependency, installDependencies } from "@saws/core/utils/dependency-management";
import { DockerService, type DockerServiceConfig } from "@saws/docker-service";
import { scaffoldFiles } from "./scaffold.js";

export interface ViteServiceConfig extends Omit<
  DockerServiceConfig,
  "image" | "dockerfile" | "buildContext" | "ports" | "command" | "entrypoint" | "healthCheck"
> {
  /** Local Vite port and published Docker port. Defaults to 5173. */
  port?: number;
}

export class ViteService extends DockerService {
  readonly port: number;
  protected override readonly serviceType = "vite";
  private viteDevProcess?: ChildProcess;
  private readonly buildAbortController = new AbortController();

  constructor(config: ViteServiceConfig) {
    const port = config.port ?? 5173;
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error(`Vite service "${config.name}" port must be an integer between 1 and 65535`);
    }
    super({
      ...config,
      dockerfile: path.join(config.name, "Dockerfile"),
      buildContext: config.name,
      ports: [`${port}:80`],
      healthCheck: {
        command: "wget -q -O /dev/null http://127.0.0.1/health",
        interval: "15s",
        timeout: "2s",
        retries: 5,
        startPeriod: "5s",
      },
    });
    this.port = port;
  }

  override async init() {
    await super.init();
    await mkdir(path.resolve(this.name, "src"), { recursive: true });
    for (const [file, contents] of Object.entries(scaffoldFiles(this.name))) {
      await createFileIfNotExists(path.resolve(this.name, file), contents);
    }
    await this.registerWorkspace();
    const options = {
      workspace: this.name,
      logSink: this.getRuntimeLogSink(),
      serviceName: this.name,
    };
    const directory = path.resolve(this.name);
    for (const [development, dependencies] of [
      [false, ["react", "react-dom"]],
      [
        true,
        [
          "vite",
          "@vitejs/plugin-react",
          "typescript",
          "@types/react",
          "@types/react-dom",
          "@types/node",
        ],
      ],
    ] as const) {
      const missing: string[] = [];
      for (const dependency of dependencies) {
        if (!(await hasDependency(dependency, directory))) missing.push(dependency);
      }
      await installDependencies(missing, { ...options, development });
    }
  }

  override async dev() {
    await ServiceDefinition.prototype.dev.call(this);
    const environment = await this.getViteEnvironment("local");
    this.writeRuntimeLog(`Start Vite dev server ${this.name} on http://localhost:${this.port}\n`);
    const child = this.spawnVite(
      ["--host", "0.0.0.0", "--port", String(this.port), "--strictPort"],
      environment,
    );
    this.viteDevProcess = child;
    child.once("error", (error) => this.writeRuntimeLog(`${error.message}\n`, "stderr"));
    child.once("exit", (code, signal) => {
      if (this.viteDevProcess !== child) return;
      this.viteDevProcess = undefined;
      if (code !== 0 && signal !== "SIGTERM" && signal !== "SIGINT") {
        this.writeRuntimeLog(`Vite dev server exited with code ${code ?? "unknown"}\n`, "stderr");
      }
    });
    await new Promise<void>((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", reject);
    });
  }

  override exit() {
    super.exit();
    this.buildAbortController.abort();
    const child = this.viteDevProcess;
    this.viteDevProcess = undefined;
    child?.kill();
  }

  protected override async buildDockerfileImage(stage: string, deploy: boolean) {
    this.writeRuntimeLog(`Build Vite application ${this.name} for ${stage}\n`);
    const child = this.spawnVite(
      ["build", "--mode", stage === "local" ? "development" : stage, "--outDir", "dist"],
      await this.getViteEnvironment(stage),
      this.buildAbortController.signal,
    );
    await new Promise<void>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code, signal) => {
        if (code === 0) resolve();
        else
          reject(
            new Error(`Vite build failed for "${this.name}" (${signal ?? `exit code ${code}`})`),
          );
      });
    });
    await super.buildDockerfileImage(stage, deploy);
  }

  private async getViteEnvironment(stage: string) {
    return {
      ...process.env,
      ...(await this.getDependenciesEnvironmentVariables(stage, "host")),
      ...(await this.getStageEnvironmentVariables(stage)),
      NODE_ENV: stage === "local" ? "development" : "production",
      STAGE: stage,
    };
  }

  private spawnVite(args: string[], env: NodeJS.ProcessEnv, signal?: AbortSignal) {
    const directory = path.resolve(this.name);
    const require = createRequire(path.join(directory, "package.json"));
    const executable = path.join(path.dirname(require.resolve("vite/package.json")), "bin/vite.js");
    const child = spawn(process.execPath, [executable, ...args], {
      cwd: directory,
      env,
      signal,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout?.on("data", (chunk: Buffer) => this.writeRuntimeLog(chunk.toString("utf8")));
    child.stderr?.on("data", (chunk: Buffer) =>
      this.writeRuntimeLog(chunk.toString("utf8"), "stderr"),
    );
    return child;
  }

  private async registerWorkspace() {
    const packagePath = path.resolve("package.json");
    const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
    if (Array.isArray(packageJson.workspaces)) {
      if (!packageJson.workspaces.includes(this.name)) packageJson.workspaces.push(this.name);
    } else {
      packageJson.workspaces = {
        ...packageJson.workspaces,
        packages: [...new Set([...(packageJson.workspaces?.packages ?? []), this.name])],
      };
    }
    await writeFile(packagePath, JSON.stringify(packageJson, null, 2) + "\n");

    const tsconfigPath = path.resolve("tsconfig.json");
    const tsconfig = JSON.parse(await readFile(tsconfigPath, "utf8"));
    const reference = `./${this.name}/tsconfig.json`;
    tsconfig.references ??= [];
    if (
      !tsconfig.references.some(
        (entry: { path: string }) => path.resolve(entry.path) === path.resolve(reference),
      )
    ) {
      tsconfig.references.push({ path: reference });
    }
    await writeFile(tsconfigPath, JSON.stringify(tsconfig, null, 2) + "\n");
  }
}

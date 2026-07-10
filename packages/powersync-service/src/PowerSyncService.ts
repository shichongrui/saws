import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ServiceDefinition } from "@saws/core";
import { hasDependency, installDependencies } from "@saws/core/utils/dependency-management";
import { fileExists } from "@saws/core/utils/file-exists";
import {
  DockerService,
  type DockerRunConfig,
  type DockerServiceConfig,
} from "@saws/docker-service";
import type { PostgresService } from "@saws/postgres-service";
import { createPowerSyncCommand, runPowerSyncCli } from "./powersync-command.js";

const POWERSYNC_CONFIG_PATH = "/config/service.yaml";
const POWERSYNC_SYNC_CONFIG_PATH = "/config/sync-config.yaml";
const POWERSYNC_DIRECTORY = "powersync";

export interface PowerSyncServiceConfig extends Omit<
  DockerServiceConfig,
  "image" | "dockerfile" | "buildContext" | "volumes" | "ports" | "command"
> {
  image?: string;
  /** Application database replicated by PowerSync. */
  applicationDatabase: PostgresService;
  /** PowerSync storage database. */
  powersyncDatabase: PostgresService;
  /** Host port to expose PowerSync on. Defaults to PS_PORT or 8080. */
  port?: number;
  /** Node heap size passed through NODE_OPTIONS. */
  maxOldSpaceSize?: number;
}

export class PowerSyncService extends DockerService {
  static getCommands(services: ServiceDefinition[] = []) {
    return [createPowerSyncCommand(services.filter(isPowerSyncService))];
  }

  readonly applicationDatabase: PostgresService;
  readonly powersyncDatabase: PostgresService;
  readonly port: number;
  readonly maxOldSpaceSize: number;
  protected override readonly serviceType = "powersync";

  constructor(config: PowerSyncServiceConfig) {
    super({
      ...config,
      image: config.image ?? "journeyapps/powersync-service:latest",
      command: ["start", "-r", "unified"],
      dependencies: [
        ...(config.dependencies ?? []),
        config.applicationDatabase,
        config.powersyncDatabase,
      ],
      healthCheck: config.healthCheck ?? {
        command:
          "node -e \"fetch('http://localhost:${PS_PORT}/probes/liveness').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))\"",
        interval: "5s",
        timeout: "1s",
        retries: 15,
      },
    });

    this.applicationDatabase = config.applicationDatabase;
    this.powersyncDatabase = config.powersyncDatabase;
    this.port = config.port ?? Number(process.env["PS_PORT"] ?? 8080);
    this.maxOldSpaceSize = config.maxOldSpaceSize ?? 1000;
  }

  override async init() {
    await super.init();
    await mkdir(path.resolve(this.name), { recursive: true });

    if (
      !(await hasDependency("powersync")) ||
      !(await fileExists(path.resolve("node_modules", ".bin", "powersync")))
    ) {
      await installDependencies(["powersync"], { development: true });
    }

    const serviceConfigPath = this.getLocalPowerSyncFilePath("service.yaml");
    if (!(await fileExists(serviceConfigPath))) {
      await this.runPowerSyncCli(["init", "self-hosted"]);
    }
    await this.configureGeneratedServiceConfig(serviceConfigPath);
  }

  override async deploy(stage: string) {
    if (this.host != null) {
      await this.writeRemoteRuntimeFile(
        stage,
        `${this.name}/${POWERSYNC_DIRECTORY}/service.yaml`,
        await readFile(this.getLocalPowerSyncFilePath("service.yaml"), "utf8"),
        { mode: 0o644 },
      );
      await this.writeRemoteRuntimeFile(
        stage,
        `${this.name}/${POWERSYNC_DIRECTORY}/sync-config.yaml`,
        await readFile(this.getLocalPowerSyncFilePath("sync-config.yaml"), "utf8"),
        { mode: 0o644 },
      );
    }

    await super.deploy(stage);
  }

  async runPowerSyncCli(powersyncArgs: string[]) {
    await runPowerSyncCli(path.resolve(this.name), powersyncArgs);
  }

  protected override async getContainerEnvironment(stage: string): Promise<Record<string, string>> {
    const applicationDatabase = await this.applicationDatabase.getConnectionInfo(
      stage,
      "container",
    );
    const powersyncDatabase = await this.powersyncDatabase.getConnectionInfo(stage, "container");
    const port = String(this.port);

    return {
      ...(await super.getContainerEnvironment(stage)),
      POWERSYNC_CONFIG_PATH,
      NODE_OPTIONS: `--max-old-space-size=${this.maxOldSpaceSize}`,
      PS_PORT: port,
      PS_DATA_SOURCE_URI: applicationDatabase.url,
      PS_DATABASE_PASSWORD: applicationDatabase.password,
      PS_STORAGE_SOURCE_URI: powersyncDatabase.url,
      PS_STORAGE_URI: powersyncDatabase.url,
      PS_STORAGE_DATABASE_URL: powersyncDatabase.url,
      PS_POWERSYNC_DATABASE_URI: powersyncDatabase.url,
      PS_POWERSYNC_DATABASE_PASSWORD: powersyncDatabase.password,
    };
  }

  protected override async getDockerRunConfig(stage: string, deploy: boolean) {
    const config = await super.getDockerRunConfig(stage, deploy);

    return {
      ...config,
      volumes: [...this.getConfigVolumes(stage), ...(config.volumes ?? [])],
      ports: [`${this.port}:${this.port}`],
    } satisfies DockerRunConfig;
  }

  private getConfigVolumes(stage: string) {
    if (stage === "local" || this.host == null) {
      return [
        `${this.getLocalPowerSyncFilePath("service.yaml")}:${POWERSYNC_CONFIG_PATH}:ro`,
        `${this.getLocalPowerSyncFilePath("sync-config.yaml")}:${POWERSYNC_SYNC_CONFIG_PATH}:ro`,
      ];
    }

    const serviceDirectory = path.posix.join(
      this.getAppDirectory(stage),
      this.name,
      POWERSYNC_DIRECTORY,
    );
    return [
      `${path.posix.join(serviceDirectory, "service.yaml")}:${POWERSYNC_CONFIG_PATH}:ro`,
      `${path.posix.join(serviceDirectory, "sync-config.yaml")}:${POWERSYNC_SYNC_CONFIG_PATH}:ro`,
    ];
  }

  private getLocalPowerSyncFilePath(fileName: string) {
    return path.resolve(this.name, POWERSYNC_DIRECTORY, fileName);
  }

  private async configureGeneratedServiceConfig(serviceConfigPath: string) {
    const serviceConfig = await readFile(serviceConfigPath, "utf8");
    const configured = configurePowerSyncServiceConfig(serviceConfig);
    if (configured !== serviceConfig) {
      await writeFile(serviceConfigPath, configured);
    }
  }
}

function isPowerSyncService(service: ServiceDefinition): service is PowerSyncService {
  return service instanceof PowerSyncService;
}

function configurePowerSyncServiceConfig(contents: string) {
  let configured = replaceTopLevelYamlEntry(contents, "port", ["port: !env PS_PORT"]);
  configured = removeTopLevelYamlBlockEntry(configured, "api", "port");

  configured = replaceTopLevelYamlBlock(configured, "storage", [
    "storage:",
    "  sslmode: disable",
    "  type: postgresql",
    "  uri: !env PS_STORAGE_SOURCE_URI",
  ]);

  if (!hasActiveTopLevelYamlBlock(configured, "replication")) {
    configured = appendTopLevelYamlBlock(configured, [
      "replication:",
      "  connections:",
      "    - sslmode: disable",
      "      type: postgresql",
      "      uri: !env PS_DATA_SOURCE_URI",
    ]);
  }

  return configured.endsWith("\n") ? configured : `${configured}\n`;
}

function hasActiveTopLevelYamlBlock(contents: string, key: string) {
  const pattern = new RegExp(`^${escapeRegExp(key)}:\\s*(?:#.*)?$`, "m");
  return pattern.test(contents);
}

function appendTopLevelYamlBlock(contents: string, block: string[]) {
  return `${contents.replace(/\s*$/, "\n\n")}${block.join("\n")}\n`;
}

function replaceTopLevelYamlEntry(contents: string, key: string, replacement: string[]) {
  const lines = contents.split(/\r?\n/);
  const start = lines.findIndex((line) =>
    new RegExp(`^${escapeRegExp(key)}:\\s*(?:.*)?$`).test(line),
  );
  if (start === -1) {
    return [...lines, ...replacement].join("\n");
  }

  let end = start + 1;
  while (end < lines.length) {
    const line = lines[end]!;
    if (/^[^\s#][^:]*:\s*(?:.*)?$/.test(line)) break;
    end += 1;
  }

  return [...lines.slice(0, start), ...replacement, ...lines.slice(end)].join("\n");
}

function removeTopLevelYamlBlockEntry(
  contents: string,
  blockKey: string,
  entryKey: string,
) {
  const lines = contents.split(/\r?\n/);
  const blockStart = lines.findIndex((line) =>
    new RegExp(`^${escapeRegExp(blockKey)}:\\s*(?:#.*)?$`).test(line),
  );
  if (blockStart === -1) {
    return contents;
  }

  let blockEnd = blockStart + 1;
  while (blockEnd < lines.length) {
    const line = lines[blockEnd]!;
    if (/^[^\s#][^:]*:\s*(?:#.*)?$/.test(line)) break;
    blockEnd += 1;
  }

  const entryPattern = new RegExp(`^\\s+${escapeRegExp(entryKey)}:\\s*(?:.*)?$`);
  const entryStart = lines.findIndex(
    (line, index) => index > blockStart && index < blockEnd && entryPattern.test(line),
  );
  if (entryStart === -1) {
    return contents;
  }

  let entryEnd = entryStart + 1;
  while (entryEnd < blockEnd) {
    const line = lines[entryEnd]!;
    if (/^\s{2}\S[^:]*:\s*(?:.*)?$/.test(line)) break;
    entryEnd += 1;
  }

  const updated = [...lines.slice(0, entryStart), ...lines.slice(entryEnd)];
  const hasRemainingBlockEntries = updated
    .slice(blockStart + 1, blockEnd - (entryEnd - entryStart))
    .some((line) => line.trim() !== "" && !line.trimStart().startsWith("#"));
  if (hasRemainingBlockEntries) {
    return updated.join("\n");
  }

  return [...updated.slice(0, blockStart), ...updated.slice(blockStart + 1)].join("\n");
}

function replaceTopLevelYamlBlock(contents: string, key: string, replacement: string[]) {
  const lines = contents.split(/\r?\n/);
  const start = lines.findIndex((line) =>
    new RegExp(`^${escapeRegExp(key)}:\\s*(?:#.*)?$`).test(line),
  );
  if (start === -1) {
    return [...lines, ...replacement].join("\n");
  }

  let end = start + 1;
  while (end < lines.length) {
    const line = lines[end]!;
    if (/^[^\s#][^:]*:\s*(?:#.*)?$/.test(line)) break;
    end += 1;
  }

  return [...lines.slice(0, start), ...replacement, ...lines.slice(end)].join("\n");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

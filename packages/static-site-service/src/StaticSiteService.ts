import { mkdir } from "node:fs/promises";
import path from "node:path";
import { createFileIfNotExists } from "@saws/core/utils/create-file-if-not-exists";
import { DockerService, type DockerServiceConfig } from "@saws/docker-service";
import { scaffoldFiles } from "./scaffold.js";

export interface StaticSiteServiceConfig extends Omit<
  DockerServiceConfig,
  "image" | "dockerfile" | "buildContext" | "ports" | "command" | "entrypoint" | "healthCheck"
> {
  /** Published HTTP port. Defaults to 8080. */
  port?: number;
}

/** Serves static files from the service folder, with extensionless HTML URLs. */
export class StaticSiteService extends DockerService {
  readonly port: number;
  protected override readonly serviceType = "static-site";

  constructor(config: StaticSiteServiceConfig) {
    const port = config.port ?? 8080;
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error(
        `Static site service "${config.name}" port must be an integer between 1 and 65535`,
      );
    }
    super({
      ...config,
      dockerfile: path.join(config.name, "Dockerfile"),
      buildContext: config.name,
      ports: [`${port}:80`],
      healthCheck: {
        command: "wget -q -O /dev/null http://127.0.0.1/_saws/health",
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
    await mkdir(path.resolve(this.name), { recursive: true });
    for (const [file, contents] of Object.entries(scaffoldFiles())) {
      await createFileIfNotExists(path.resolve(this.name, file), contents);
    }
  }

  protected override async getDockerRunConfig(stage: string, deploy: boolean) {
    const config = await super.getDockerRunConfig(stage, deploy);
    if (!deploy) {
      config.volumes = [
        ...(config.volumes ?? []),
        `${path.resolve(this.name)}:/usr/share/nginx/html:ro`,
      ];
    }
    return config;
  }
}

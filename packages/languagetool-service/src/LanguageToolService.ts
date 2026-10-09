import type { ServiceEnvironmentTarget } from "@saws/core";
import {
  DockerService,
  type DockerRunConfig,
  type DockerServiceConfig,
} from "@saws/docker-service";

const LANGUAGETOOL_PORT = 8081;

export type LanguageToolNgramLanguage = "en" | "de" | "es" | "fr" | "nl";

export interface LanguageToolConnectionInfo {
  host: string;
  port: string;
  /** API base URL including /v2. Append /check or /languages to call the API. */
  url: string;
}

export interface LanguageToolServiceConfig extends Omit<
  DockerServiceConfig,
  "image" | "dockerfile" | "buildContext" | "ports" | "entrypoint" | "command"
> {
  /** Defaults to meyay/languagetool:6.8-12. Overrides must support the same environment contract. */
  image?: string;
  /** Host port. Local dev defaults to 8081; deploys stay private unless explicitly set. */
  port?: number;
  /** Languages whose n-gram models should be downloaded. These can require several GB each. */
  ngramLanguages?: LanguageToolNgramLanguage[];
  /** Override the stage-specific volume mounted at /ngrams. */
  ngramsVolume?: string;
  /** Override the stage-specific volume mounted at /fasttext. */
  fasttextVolume?: string;
  /** Enable fastText language detection and its model download. Defaults to true. */
  fasttext?: boolean;
  /** Custom JVM options (JAVA_OPTS), replacing the image's default heap/GC settings. */
  javaOptions?: string;
}

/**
 * Self-hosted LanguageTool proofreading API. Add this service to an application's
 * dependencies to inject <NAME>_LANGUAGETOOL_URL, including the /v2 API path.
 * Advanced server properties can be set through stage environment keys such as
 * langtool_maxTextLength. The self-hosted server does not include cloud AI rules.
 *
 * @example
 * const grammar = new LanguageToolService({ name: "grammar", host });
 * const api = new HonoService({ name: "api", host, dependencies: [grammar] });
 * // Application: POST `${process.env.GRAMMAR_LANGUAGETOOL_URL}/check`
 * // with form fields text and language (for example, en-US).
 */
export class LanguageToolService extends DockerService {
  readonly port?: number;
  readonly ngramLanguages: readonly LanguageToolNgramLanguage[];
  readonly ngramsVolume?: string;
  readonly fasttextVolume?: string;
  readonly fasttext: boolean;
  readonly javaOptions?: string;
  protected override readonly serviceType = "languagetool";

  constructor(config: LanguageToolServiceConfig) {
    if (
      config.port != null &&
      (!Number.isInteger(config.port) || config.port < 1 || config.port > 65_535)
    ) {
      throw new Error("LanguageTool port must be a valid TCP port");
    }

    super({
      ...config,
      image: config.image ?? "meyay/languagetool:6.8-12",
      healthCheck: config.healthCheck ?? {
        command: `wget -q -O /dev/null http://127.0.0.1:${LANGUAGETOOL_PORT}/v2/languages`,
        interval: "30s",
        timeout: "10s",
        retries: 5,
        startPeriod: "120s",
      },
    });

    this.port = config.port;
    this.ngramLanguages = [...(config.ngramLanguages ?? [])];
    this.ngramsVolume = config.ngramsVolume;
    this.fasttextVolume = config.fasttextVolume;
    this.fasttext = config.fasttext ?? true;
    this.javaOptions = config.javaOptions;
  }

  getConnectionInfo(
    stage: string,
    target: ServiceEnvironmentTarget = "host",
  ): LanguageToolConnectionInfo {
    const published = stage === "local" || this.port != null;
    const container = target === "container" || !published;
    const host = container
      ? this.getContainerName(stage)
      : stage === "local"
        ? "localhost"
        : this.host.address;
    const port = String(container ? LANGUAGETOOL_PORT : (this.port ?? LANGUAGETOOL_PORT));
    const urlHost = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;

    return { host, port, url: `http://${urlHost}:${port}/v2` };
  }

  override async getEnvironmentVariables(
    stage: string,
    target: ServiceEnvironmentTarget = "container",
  ): Promise<Record<string, string>> {
    const connection = this.getConnectionInfo(stage, target);
    const prefix = this.name.replace(/[^a-zA-Z\d]/g, "_").toUpperCase();

    return {
      [`${prefix}_LANGUAGETOOL_HOST`]: connection.host,
      [`${prefix}_LANGUAGETOOL_PORT`]: connection.port,
      [`${prefix}_LANGUAGETOOL_URL`]: connection.url,
    };
  }

  protected override async getContainerEnvironment(stage: string): Promise<Record<string, string>> {
    return {
      ...(await super.getContainerEnvironment(stage)),
      LISTEN_PORT: String(LANGUAGETOOL_PORT),
      DISABLE_FASTTEXT: String(!this.fasttext),
      download_ngrams_for_langs:
        this.ngramLanguages.length === 0 ? "none" : this.ngramLanguages.join(","),
      ...(this.javaOptions == null ? {} : { JAVA_OPTS: this.javaOptions }),
    };
  }

  protected override async getDockerRunConfig(stage: string, deploy: boolean) {
    const config = await super.getDockerRunConfig(stage, deploy);

    return {
      ...config,
      ports:
        deploy && this.port == null
          ? []
          : [`${this.port ?? LANGUAGETOOL_PORT}:${LANGUAGETOOL_PORT}`],
      volumes: [
        `${this.ngramsVolume ?? this.getVolumeName(stage, "ngrams")}:/ngrams`,
        `${this.fasttextVolume ?? this.getVolumeName(stage, "fasttext")}:/fasttext`,
        ...(config.volumes ?? []),
      ],
    } satisfies DockerRunConfig;
  }

  protected override async onContainerStarted(stage: string) {
    const connection = this.getConnectionInfo(stage, "host");
    await this.setOutputs(
      {
        languagetoolHost: connection.host,
        languagetoolPort: connection.port,
        languagetoolUrl: connection.url,
      },
      stage,
    );
  }

  private getVolumeName(stage: string, model: string) {
    return `${stage}-${this.name}-languagetool-${model}`.replaceAll("_", "-").toLowerCase();
  }
}

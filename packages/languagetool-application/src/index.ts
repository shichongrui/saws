import {
  ServiceDefinition,
  type Host,
  type SecretReference,
  type StageEnvironmentVariables,
} from "@saws/core";
import { LanguageToolService, type LanguageToolNgramLanguage } from "@saws/languagetool-service";
import { LanguageToolGateway, PrivateLanguageToolService } from "./gateway.js";

export interface LanguageToolApplicationConfig {
  /** Host where LanguageTool is deployed. */
  host: Host;
  /** Single bearer key. At least one of apiKey or apiKeys is required. */
  apiKey?: string | SecretReference;
  /** Accepted bearer keys, in addition to apiKey. Prefer stage-scoped secret references. */
  apiKeys?: readonly (string | SecretReference)[];
  /** Service, network, and default volume prefix. Defaults to "languagetool". */
  name?: string;
  /** Docker network base name. Defaults to the application name. */
  network?: string;
  /** Remote SAWS application directory. Defaults to DockerService's /opt/saws. */
  appDirectory?: string;
  /** Image compatible with the LanguageTool service's environment contract. */
  image?: string;
  /** Host port for the authenticated HTTP gateway. Defaults to 8081. */
  port?: number;
  /** Languages whose n-gram models should be downloaded. These can require several GB each. */
  ngramLanguages?: LanguageToolNgramLanguage[];
  /** Override the stage-specific volume mounted at /ngrams. */
  ngramsVolume?: string;
  /** Override the stage-specific volume mounted at /fasttext. */
  fasttextVolume?: string;
  /** Enable fastText language detection and its model download. Defaults to true. */
  fasttext?: boolean;
  /** Custom JVM options, replacing the image's default heap/GC settings. */
  javaOptions?: string;
  /** Stage-specific server settings, including langtool_* properties. */
  environment?: StageEnvironmentVariables;
}

export interface LanguageToolApplicationServices {
  root: ServiceDefinition;
  languagetool: LanguageToolService;
  gateway: LanguageToolGateway;
}

export function createLanguageToolServices(
  config: LanguageToolApplicationConfig,
): LanguageToolApplicationServices {
  const name = config.name ?? "languagetool";
  const languagetool = new PrivateLanguageToolService({
    name,
    host: config.host,
    network: config.network ?? name,
    appDirectory: config.appDirectory,
    image: config.image,
    ngramLanguages: config.ngramLanguages,
    ngramsVolume: config.ngramsVolume,
    fasttextVolume: config.fasttextVolume,
    fasttext: config.fasttext,
    javaOptions: config.javaOptions,
    environment: config.environment,
  });
  const gateway = new LanguageToolGateway({
    name: `${name}-gateway`,
    host: config.host,
    network: config.network ?? name,
    appDirectory: config.appDirectory,
    port: config.port ?? 8081,
    apiKey: config.apiKey,
    apiKeys: config.apiKeys,
    languagetool,
  });
  const root = new ServiceDefinition({
    name: `${name}-application`,
    dependencies: [gateway],
  });

  return { root, languagetool, gateway };
}

/** Factory consumed by `saws app install`. */
export function create(config: LanguageToolApplicationConfig) {
  return createLanguageToolServices(config).root;
}

export type { LanguageToolNgramLanguage } from "@saws/languagetool-service";

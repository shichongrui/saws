import {
  ServiceDefinition,
  type Host,
  type SecretReference,
  type StageEnvironmentVariables,
} from "@saws/core";
import { ClickHouseKeeperService } from "@saws/clickhouse-keeper-service";
import { ClickHouseService } from "@saws/clickhouse-service";
import { PostgresService } from "@saws/postgres-service";
import {
  SigNozOtelCollectorService,
  SigNozSchemaMigrationService,
} from "@saws/signoz-otel-collector-service";
import { SigNozService } from "@saws/signoz-service";

export interface SigNozApplicationConfig {
  /** Host where every SigNoz component is deployed. */
  host: Host;
  /** Prefix for service, network, and volume names. Defaults to "signoz". */
  name?: string;
  /** Docker network base name. Defaults to the application name. */
  network?: string;
  /** Remote SAWS application directory. Defaults to DockerService's /opt/saws. */
  appDirectory?: string;
  /** Host port for the SigNoz UI and API. Defaults to 8080. */
  port?: number;
  /** Host port for OTLP over gRPC. Defaults to 4317. */
  otlpGrpcPort?: number;
  /** Host port for OTLP over HTTP. Defaults to 4318. */
  otlpHttpPort?: number;
  /** Optional stage-scoped secret used for the SigNoz PostgreSQL metastore. */
  postgresPassword?: SecretReference;
  /** Stage-specific environment passed to the SigNoz API/UI container. */
  signozEnvironment?: StageEnvironmentVariables;
  /** Stage-specific environment passed to the SigNoz OTel collector. */
  collectorEnvironment?: StageEnvironmentVariables;
  images?: {
    postgres?: string;
    clickhouseKeeper?: string;
    clickhouse?: string;
    signoz?: string;
    otelCollector?: string;
  };
}

export interface SigNozApplicationServices {
  root: ServiceDefinition;
  postgres: PostgresService;
  keeper: ClickHouseKeeperService;
  clickhouse: ClickHouseService;
  migrations: SigNozSchemaMigrationService;
  signoz: SigNozService;
  collector: SigNozOtelCollectorService;
}

export function createSigNozServices(config: SigNozApplicationConfig): SigNozApplicationServices {
  const name = config.name ?? "signoz";
  const network = config.network ?? name;
  const common = {
    host: config.host,
    network,
    appDirectory: config.appDirectory,
  };

  const postgres = new PostgresService({
    ...common,
    name: `${name}-postgres`,
    image: config.images?.postgres ?? "postgres:16",
    database: "signoz",
    username: "signoz",
    password: config.postgresPassword,
  });
  const keeper = new ClickHouseKeeperService({
    ...common,
    name: `${name}-keeper`,
    image: config.images?.clickhouseKeeper,
  });
  const clickhouse = new ClickHouseService({
    ...common,
    name: `${name}-clickhouse`,
    keeper,
    image: config.images?.clickhouse,
  });
  const migrations = new SigNozSchemaMigrationService({
    ...common,
    name: `${name}-migrations`,
    clickhouse,
    image: config.images?.otelCollector,
  });
  const signoz = new SigNozService({
    ...common,
    name,
    postgres,
    clickhouse,
    prerequisites: [migrations],
    image: config.images?.signoz,
    port: config.port,
    environment: config.signozEnvironment,
  });
  const collector = new SigNozOtelCollectorService({
    ...common,
    name: `${name}-otel-collector`,
    clickhouse,
    signoz,
    migrations,
    image: config.images?.otelCollector,
    grpcPort: config.otlpGrpcPort,
    httpPort: config.otlpHttpPort,
    environment: config.collectorEnvironment,
  });
  const root = new ServiceDefinition({
    name: `${name}-application`,
    dependencies: [signoz, collector],
  });

  return { root, postgres, keeper, clickhouse, migrations, signoz, collector };
}

/** Factory consumed by `saws app install`. */
export function create(config: SigNozApplicationConfig) {
  return createSigNozServices(config).root;
}

# Current service and client catalog

## Contents

- Service matrix
- DockerService
- HonoService
- PostgresService and client
- RedisService and client
- RustFsFileService and client
- PowerSyncService

## Service matrix

| Package                     | Base                | Primary role                      | Init work                                          | Consumer contract                          |
| --------------------------- | ------------------- | --------------------------------- | -------------------------------------------------- | ------------------------------------------ |
| `@saws/docker-service`      | `ServiceDefinition` | Generic container                 | None                                               | None by default                            |
| `@saws/hono-service`        | `DockerService`     | Node/Hono HTTP app                | Scaffold workspace/app/Dockerfile and install deps | None                                       |
| `@saws/postgres-service`    | `DockerService`     | PostgreSQL plus dbmate migrations | Create migrations dir; install dbmate              | `<NAME>_POSTGRES_*`, `<NAME>_DATABASE_URL` |
| `@saws/redis-service`       | `DockerService`     | Password-protected Redis          | None                                               | `<NAME>_REDIS_*`                           |
| `@saws/rustfs-file-service` | `DockerService`     | S3-compatible object storage      | None                                               | `<NAME>_FILES_*`                           |
| `@saws/powersync-service`   | `DockerService`     | PowerSync sync service            | Install CLI; initialize/configure YAML             | None                                       |

All packages are ESM and export their public module from package root.

## DockerService

Public configuration includes the base `ServiceDefinitionConfig` plus:

- Required `host` by current type.
- One image mode: `image`, explicit `dockerfile`/`buildContext`, or default `<name>/Dockerfile` with context `<name>`.
- `appDirectory` default `/opt/saws`.
- `network` default `saws`.
- Optional `registry` and `auth` for remote Dockerfile deploys.
- `volumes`, `ports`, `command`, `labels`, `restart`, and `healthCheck`.

Run config labels always include `saws.service`, `saws.serviceType`, and `saws.stage`. Restart defaults to `unless-stopped` in the generated command. Health checks use Docker `CMD-SHELL` semantics.

Important protected extension points:

- `getContainerName`, `getContainerEnvironment`, `getDockerRunConfig`
- `onContainerStarted`
- image build/push and network helpers
- local detached, remote, and ephemeral container runners
- Docker command/config hash helpers
- environment/runtime-file writers and cleanup

## HonoService

Config removes direct image/Dockerfile/port/command/health-check control and adds:

- `port?: number`: defaults to process `PORT` or 3000.
- `domain?: string`: stored but not currently active in deployment routing.

`init()` creates `<name>/src/index.ts`, package metadata, TypeScript config, and a multi-stage Dockerfile only when absent. It adds the app directory to root workspaces, adds its TypeScript project reference, and installs runtime/dev dependencies in that workspace.

`dev()` deliberately bypasses `DockerService.dev()` and invokes the base graph/hook behavior before running `npx tsx watch src/index.ts` on the host. It injects dependencies using host-target addresses. Deploy uses the standard Docker path. The generated app must retain a successful `/health` route unless the health check is changed in the service implementation.

The class contains private Traefik/blue-green helpers, but current deploy does not invoke them. Direct port publishing is the active behavior.

## PostgresService and client

Config:

- Image default `postgres:18`.
- Optional host `port`; local defaults 5432 and remote stays private when omitted.
- Optional `database`; default `<stage>_<name>` normalized with underscores.
- `username` default `postgres`.
- Optional password `SecretReference`; otherwise generate and persist a stage secret.
- Optional volume; default `<stage>-<name>-postgres-data`.
- Data directory default `/var/lib/postgresql`; override `dataDirectory` for images with a different
  persistent mount path, such as `/var/lib/postgresql/data` for PostgreSQL 17 and earlier.
- `wal_enabled` enables `wal_level=logical`.
- Migration image default `ghcr.io/amacneil/dbmate:2.33.0`.

Exported variables:

- `<NAME>_POSTGRES_HOST`
- `<NAME>_POSTGRES_PORT`
- `<NAME>_POSTGRES_USERNAME`
- `<NAME>_POSTGRES_PASSWORD`
- `<NAME>_POSTGRES_DB_NAME`
- `<NAME>_DATABASE_URL`

Container target uses container name and port 5432. Host target uses localhost for local stage, container name for deployed stage, and configured/default host port. URLs add `sslmode=disable` unless already present.

After start it writes parallel connection outputs. `dev()` and `deploy()` run migrations after the database lifecycle. Local migrations execute workspace dbmate against the host target. Remote migrations copy files and run an ephemeral dbmate container on the service network, then clean them up. No migration files means no action.

`PostgresClient(serviceName, options)` extends `pg.Pool`, obtains `<NAME>_DATABASE_URL`, and permits normal pool options to override the constructed connection string if supplied later in options.

## RedisService and client

Config:

- Image default `redis:8`.
- Optional host port; local default 6379 and remote private when omitted.
- Optional explicit password; otherwise generate and persist a stage secret. Existing plaintext credentials are migrated when found.
- Optional volume; default `<stage>-<name>-redis-data`.
- Data directory default `/data`.

Exported variables are `<NAME>_REDIS_HOST`, `_REDIS_PORT`, `_REDIS_PASSWORD`, and `_REDIS_URL`. Container target uses container DNS/6379; host target uses localhost locally and container name when deployed. The container starts `redis-server` with password authentication and persistence settings.

`RedisClient(serviceName, options)` extends ioredis and resolves `<NAME>_REDIS_URL`.

## RustFsFileService and client

Config:

- Image default `rustfs/rustfs:latest`.
- API/dashboard host ports default 9000/9001.
- Access key ID default `rustfsadmin`.
- Optional explicit secret access key; otherwise generate and persist a stage secret. Existing plaintext credentials are migrated when found.
- Region default `us-east-1`.
- Bucket default normalized `<stage>-<name>`.
- Optional volume; default `<stage>-<name>-rustfs-data`.
- Data directory default `/data`.

Exported variables:

- `<NAME>_FILES_ENDPOINT`
- `<NAME>_FILES_DASHBOARD_ENDPOINT`
- `<NAME>_FILES_ACCESS_KEY_ID`
- `<NAME>_FILES_SECRET_ACCESS_KEY`
- `<NAME>_FILES_REGION`
- `<NAME>_FILES_BUCKET`

Container target uses container DNS and internal ports. Host target uses localhost locally and the configured host address remotely. Both ports are currently published for deployment.

`FilesClient` wraps AWS S3 APIs, lazily ensures the bucket exists, and supports get/read/write/delete/exists/list plus signed download/upload URLs. It accepts explicit overrides and backward-compatible `_RUSTFS_*` environment names.

## PowerSyncService

Config:

- Image default `journeyapps/powersync-service:latest`.
- Required `applicationDatabase: PostgresService` and `powersyncDatabase: PostgresService`.
- Port default `PS_PORT` or 8080.
- Heap limit default 1000 MB.

The constructor appends both databases to dependencies, preserves explicit dependencies, starts PowerSync with `start -r unified`, and supplies a liveness health check.

`init()` creates `<name>/powersync`, ensures the `powersync` CLI, initializes self-hosted configuration when missing, and rewrites generated `service.yaml` to use environment-driven port, PostgreSQL storage, and replication settings.

Container environment gets typed connection data directly from both databases using container targets. Config files mount read-only at `/config/service.yaml` and `/config/sync-config.yaml`. Remote deploy writes them to the stage app directory before the standard Docker deployment. The service currently publishes its port.

The static project command runs the PowerSync CLI for the selected instance.

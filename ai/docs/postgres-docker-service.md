# `PostgresDockerService`

[Home](./README.md) · [Getting started](./getting-started.md) · [CLI](./cli.md) ·
[Lifecycle](./service-lifecycle.md) · [Docker](./docker-service.md) ·
[Supporting APIs](./supporting-apis.md) · [Limitations](./limitations.md)

Runs PostgreSQL using `DockerService`, with database credentials, persistent
storage, port mapping, and a connection environment contract.

## Usage

```ts
import { PostgresDockerService } from "@saws/postgres";

const database = new PostgresDockerService({
  name: "db",
  docker,
  image: "postgres:16",
  port: 15432,
  database: "application",
  username: "application",
});
```

## Development

`saws dev` starts PostgreSQL on the local Docker daemon and always publishes
the database port. The host port is `port` when configured and `5432`
otherwise.

Initialize the service before creating migrations:

```bash
npx saws init db
npx saws migrate create_users
```

Initialization creates `<service-name>/migrations`, adds `dbmate` to the
project's development dependencies, and runs `npm install`. Existing package
metadata is preserved. The injected `migrate` command delegates to
`npm exec -- dbmate new <name>`, which creates a timestamped SQL migration in
that directory. If the config contains multiple Postgres services, select one
with `npx saws migrate --service <service-name> create_users`.

Database data is stored in a named Docker volume and survives container
replacement. A generated password is stored in
`.saws/secrets/dev.env` under `<service>-postgres-password`.

The prototype does not create Prisma files, install Prisma packages, generate a
client, or watch a schema. Migration files are framework-independent SQL
managed by dbmate.

## Deployment

`saws deploy` runs PostgreSQL on the configured Docker host and the provider's
stage-specific Docker network. The database is reachable by other containers
in that stage through its stage-aware container name. Containers from another
stage are not attached to that network.

After PostgreSQL starts, deployment uploads the SQL files from
`<service-name>/migrations` and runs all pending migrations with dbmate in a
temporary container attached to the same stage-specific Docker network. Dbmate
waits up to 60 seconds for PostgreSQL to become available. A migration failure
fails the deployment. Migration files and the temporary database environment
file are removed from the host after the command completes.

The PostgreSQL port is not published on the host unless `port` is configured.
For example, `port: 15432` maps host port `15432` to container port `5432`.

PostgreSQL data is mounted at `/var/lib/postgresql` by default. This layout is
compatible with fresh volumes used by the default PostgreSQL 16 image and the
recommended volume target for PostgreSQL 18+ images.

Passwords generated during deployment are currently persisted only in the
local stage secrets file. The value is transferred in the temporary container
environment file during deployment; the prototype does not provide remote
secret storage or rotation.

## Constructor options

The service also accepts the [common service options](./service-lifecycle.md#common-options).

### `docker: DockerProvider`

Required. The provider used to run the PostgreSQL container.

### `image?: string`

The PostgreSQL image. Defaults to `"postgres:16"`.

### `port?: number`

The host port mapped to container port `5432`. Development defaults to `5432`.
During deployment, omitting this option keeps PostgreSQL private to the Docker
network.

### `database?: string`

The database created by the image. It defaults to the lower-case stage and
service name joined with an underscore, with hyphens converted to underscores.
For example, service `accounts-db` in stage `production` uses
`production_accounts_db`.

### `username?: string`

The PostgreSQL username. Defaults to `"postgres"`.

### `password?: string`

An explicit PostgreSQL password. When omitted, SAWS generates a password and
stores it in the stage secrets file.

### `volume?: string`

Overrides the generated Docker volume name. The default is
`<stage>-<service>-postgres-data`, normalized to lower-case Docker naming.
An explicit override is used unchanged; include the stage in that name when
the same configuration deploys multiple stages to one host.

### `dataDirectory?: string`

The path inside the container where the volume is mounted. Defaults to
`"/var/lib/postgresql"`.

### `migrationImage?: string`

The dbmate image used to apply migrations during deployment. Defaults to
`"ghcr.io/amacneil/dbmate:v2.33.0"`.

### Other Docker options

`environment`, `command`, `labels`, `restart`, and `healthCheck` are inherited from
`DockerService`. The service owns its image source, port mapping, and data
volume, so `dockerfile`, `buildContext`, `ports`, and `volumes` are not accepted.

PostgreSQL defaults the inherited `healthCheck` option to `pg_isready` using
the configured database and user. Supply another health-check configuration to
override it, or set `healthCheck: false` to disable it.

Explicit `environment` values are merged with dependency variables first.
`POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB` are then set from this
service's connection configuration.

## Dependency behavior

For a service named `db`, `PostgresDockerService` injects:

```text
DB_POSTGRES_HOST
DB_POSTGRES_PORT
DB_POSTGRES_USERNAME
DB_POSTGRES_PASSWORD
DB_POSTGRES_DB_NAME
DB_DATABASE_URL
```

The prefix is the upper-case service name with hyphens replaced by
underscores.

Inside another Docker container, `DB_POSTGRES_HOST` is the PostgreSQL container
name and `DB_POSTGRES_PORT` is `5432`. For local host consumers, the host is
`localhost` and the port is the configured host `port`, defaulting to `5432`
during development.

## Outputs

`getOutputs(context)` returns:

```ts
{
  postgresHost: string;
  postgresPort: string;
  postgresUsername: string;
  postgresPassword: string;
  postgresDBName: string;
  databaseUrl: string;
}
```

These values follow the same host-targeted connection behavior described above.

## Libraries

The `@saws/postgres` package exports a `Postgres` client that extends
`pg.Pool` and reads the injected database URL:

```ts
import { Postgres } from "@saws/postgres";

const pool = new Postgres("db");
const result = await pool.query("select now()");
```

Standard `pg.Pool` options can be passed as the second argument. Consumers can
also use the injected `*_DATABASE_URL` with another database library.

[← DockerService](./docker-service.md) ·
[Next: Supporting APIs →](./supporting-apis.md)

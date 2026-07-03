# `@saws/postgres`

Provides the SAWS PostgreSQL service and a `pg` connection pool configured from
the database URL exposed by that service.

`PostgresDockerService` applies pending SQL migrations from `db/migrations`
with dbmate after its PostgreSQL container starts during `saws deploy`.

```ts
import { Postgres, PostgresDockerService } from "@saws/postgres";

const database = new PostgresDockerService({
  name: "db",
});

const pool = new Postgres("db");
const result = await pool.query("select now()");
```

A service name is converted to the environment variable injected by SAWS:
`db` becomes `DB_DATABASE_URL` and `primary-db` becomes
`PRIMARY_DB_DATABASE_URL`.

`Postgres` extends `pg.Pool`, so the standard pool API is available. Pool
options can be passed as the second argument:

```ts
const pool = new Postgres("db", {
  max: 10,
  idleTimeoutMillis: 30_000,
});
```

The client resolves the URL from `globalThis.ENV` first, then from
`process.env`. An explicit `environment` option is also available for tests
and application adapters.

# `@saws/postgres`

Provides the SAWS PostgreSQL service and a `pg` connection pool configured from
the database URL exposed by that service.

`PostgresDockerService` applies pending SQL migrations from `db/migrations`
with dbmate after its PostgreSQL container starts during `saws deploy`.

The `saws migrate` command forwards its arguments to the project-local dbmate
executable:

```sh
npx saws migrate up
npx saws migrate new create_users
npx saws migrate rollback
```

```ts
import { Postgres, PostgresDockerService } from "@saws/postgres";
import { SecretsManager } from "@saws/secrets";

const database = new PostgresDockerService({
  name: "db",
  database: "application",
  username: "application-user",
  password: SecretsManager.reference("database-password"),
});

const pool = new Postgres("db");
const result = await pool.query("select now()");
```

Set the referenced password independently for each stage:

```sh
npx saws secrets database-password --stage local --set 'local-password'
npx saws secrets database-password --stage production --set 'production-password'
```

If `password` is omitted, SAWS generates and stores a stage-specific password.
Plaintext password strings are also supported.

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

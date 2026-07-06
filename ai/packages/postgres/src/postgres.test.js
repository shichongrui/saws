import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";
import { Postgres, postgresServiceUrlEnvironmentVariable, resolvePostgresServiceUrl, } from "./index.js";
test("derives the database URL variable used by a Postgres service", () => {
    assert.equal(postgresServiceUrlEnvironmentVariable("primary-db"), "PRIMARY_DB_DATABASE_URL");
});
test("resolves a service URL from an application environment", () => {
    assert.equal(resolvePostgresServiceUrl("primary-db", {
        PRIMARY_DB_DATABASE_URL: "postgresql://app:secret@localhost:5432/application",
    }), "postgresql://app:secret@localhost:5432/application");
});
test("creates a configured pg Pool", async () => {
    const connectionString = "postgresql://app:secret@localhost:5432/application";
    const pool = new Postgres("primary-db", {
        environment: { PRIMARY_DB_DATABASE_URL: connectionString },
        max: 4,
    });
    assert.ok(pool instanceof Pool);
    assert.equal(pool.options.connectionString, connectionString);
    assert.equal(pool.options.max, 4);
    await pool.end();
});
test("reports the expected variable when configuration is missing", () => {
    assert.throws(() => resolvePostgresServiceUrl("missing-db", {}), /MISSING_DB_DATABASE_URL/);
});

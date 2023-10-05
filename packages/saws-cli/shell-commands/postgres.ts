import path from "path";
import { dockerCommand } from "docker-cli-js";
import { SAWS_DIR, retryUntil } from "@shichongrui/saws-core";
import { Client } from "pg";
import { onProcessExit } from "../utils/on-exit";

export const startPostgres = async (password: string) => {
  console.log("Starting postgres...");

  onProcessExit(() => {
    dockerCommand("stop saws-postgres", { echo: false });
  });

  await dockerCommand(
    `run --rm --name saws-postgres -e POSTGRES_PASSWORD=${password} -p 5432:5432 -d -v ${path.resolve(
      SAWS_DIR,
      "postgres"
    )}/:/var/lib/postgresql/data postgres:14`,
    { echo: false }
  );

  await retryUntil(async () => {
    try {
      const client = new Client({
        user: "postgres",
        password,
      });
      await client.connect();
      await client.end();
      return true;
    } catch (err) {
      return false;
    }
  }, 1000);

  return {
    postgresHost: "localhost",
    postgresPort: "5432",
    postgresUsername: "postgres",
    postgresDBName: "postgres",
  };
};

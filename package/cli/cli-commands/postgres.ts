import path from "path";
import { dockerCommand } from "docker-cli-js";
import { SAWS_DIR } from "../../utils/constants";
import retryUntil from "../../utils/retry-until";
import { Client } from "pg";

export const startPostgres = async () => {
  console.log("Starting postgres...");
  await dockerCommand(
    `run -it --rm --name saws-postgres -e POSTGRES_PASSWORD=password -p 5432:5432 -d -v ${path.resolve(
      SAWS_DIR,
      "postgres"
    )}/:/var/lib/postgresql/data postgres:14`,
    { echo: false }
  );

  await retryUntil(async () => {
    try {
      const client = new Client({
        user: "postgres",
        password: "password",
      });
      await client.connect();
      await client.end();
      return true;
    } catch (err) {
      return false;
    }
  }, 1000);

  process.on("exit", () => {
    dockerCommand("stop saws-postgres", { echo: false });
  });
  process.on("SIGINT", () => {
    dockerCommand("stop saws-postgres", { echo: false });
  });

  return {
    postgresHost: "localhost",
    postgresPort: "5432",
    postgresUsername: "postgres",
    postgresDBName: "postgres",
  };
};

import { randomUUID } from "crypto";
import { dockerCommand } from "docker-cli-js";
import { getDBPassword } from "../../utils/get-db-parameters";
import { getStageOutputs } from "../../utils/stage-outputs";
import {
  isContainerRunning,
  waitForContainerToBeStopped,
} from "../cli-commands/docker";
import { startPostgres } from "../cli-commands/postgres";
import { createPrismaMigration } from "../cli-commands/prisma";

export const migrate = async () => {
  const { database: outputs } = await getStageOutputs("local");
  const password = await getDBPassword("local");
  const isPostgresRunning = await isContainerRunning(
    `${outputs.postgresDBName}-postgres`
  );
  if (!isPostgresRunning) {
    await startPostgres(password);
  }

  await createPrismaMigration({
    name: randomUUID(),
    username: String(outputs.postgresUsername),
    password,
    endpoint: String(outputs.postgresHost),
    port: String(outputs.postgresPort),
    dbName: String(outputs.postgresDBName),
  });

  if (!isPostgresRunning) {
    dockerCommand("stop saws-postgres", { echo: false });
    await waitForContainerToBeStopped("saws-postgres");
  }

  return;
};

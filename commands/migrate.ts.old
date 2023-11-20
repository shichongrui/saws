import { randomUUID } from "crypto";
import { dockerCommand } from "docker-cli-js";
import { getDBPassword } from "../utils/get-db-parameters";
import { getStageOutputs } from "../utils/stage-outputs";
import {
  isContainerRunning,
  waitForContainerToBeStopped,
} from "../shell-commands/docker";
import { startPostgres } from "../shell-commands/postgres";
import { createPrismaMigration } from "../shell-commands/prisma";
import { getSawsConfig } from "../utils/get-saws-config";
import { ServiceType } from "@shichongrui/saws-core";

export const migrate = async () => {
  const config = await getSawsConfig('.')

  const rdsService = Object.entries(config.services).find(([key, value]) => {
    return value.type === ServiceType.POSTGRES
  })
  if (rdsService == null) {
    console.error('No RDS service found in config')
    process.exit(1)
  }

  const [name] = rdsService

  const { [name]: outputs } = await getStageOutputs("local");
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

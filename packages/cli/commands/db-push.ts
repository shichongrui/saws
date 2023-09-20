import { randomUUID } from "crypto";
import { dockerCommand } from "docker-cli-js";
import { getDBPassword } from "../../utils/get-db-parameters";
import { getStageOutputs } from "../../utils/stage-outputs";
import {
  isContainerRunning,
  waitForContainerToBeStopped,
} from "../cli-commands/docker";
import { startPostgres } from "../cli-commands/postgres";
import { pushPrisma } from "../cli-commands/prisma";
import { Postgres } from "../modules";
import { getModulesOfType } from "../utils/get-modules-of-type";
import { getSawsConfig } from "../../utils/get-saws-config";
import { ServiceType } from "../../config";

export const dbPush = async () => {
  const config = await getSawsConfig('.')
  const [postgresModule] = getModulesOfType(ServiceType.POSTGRES, config)
  console.log(postgresModule)
  const { [postgresModule.name]: outputs } = await getStageOutputs("local");
  console.log(outputs)
  const password = await getDBPassword("local");
  const isPostgresRunning = await isContainerRunning(
    `${outputs.postgresDBName}-postgres`
  );
  if (!isPostgresRunning) {
    await startPostgres(password);
  }

  await pushPrisma({
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

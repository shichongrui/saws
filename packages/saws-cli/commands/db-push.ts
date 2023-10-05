import { dockerCommand } from "docker-cli-js";
import { getDBPassword } from "../utils/get-db-parameters";
import { getStageOutputs } from "../utils/stage-outputs";
import {
  isContainerRunning,
  waitForContainerToBeStopped,
} from "../shell-commands/docker";
import { startPostgres } from "../shell-commands/postgres";
import { pushPrisma } from "../shell-commands/prisma";
import { getModulesOfType } from "../utils/get-modules-of-type";
import { getSawsConfig } from "../utils/get-saws-config";
import { ServiceType } from "@shichongrui/saws-core";

export const dbPush = async () => {
  const config = await getSawsConfig('.')
  const [postgresModule] = getModulesOfType(ServiceType.POSTGRES, config)
  const { [postgresModule.name]: outputs } = await getStageOutputs("local");
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

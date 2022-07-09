import { startPrismaStudio } from "../cli-commands/prisma";
import { DB_PASSWORD_PARAMETER_NAME } from "../../utils/constants";
import SecretsManager from "../../secrets";
import { getStageOutputs } from "../../utils/stage-outputs";

export async function startStudio(stage: string) {
  const secretsManager = new SecretsManager(stage);
  const dbPassword = await secretsManager.get(DB_PASSWORD_PARAMETER_NAME);
  const outputs = await getStageOutputs(stage);

  await startPrismaStudio({
    username: outputs.postgresUsername,
    password: dbPassword,
    endpoint: outputs.postgresHost,
    port: outputs.postgresPort,
    dbName: outputs.postgresDBName,
    openBrowser: true,
  });
}

import { startPrismaStudio } from "../cli-commands/prisma";
import { DB_PASSWORD_PARAMETER_NAME } from "../../utils/constants";
import SecretsManager from "../../secrets";
import { getStageOutputs } from "../../utils/stage-outputs";
import { startPostgres } from "../cli-commands/postgres";

export async function startStudio(stage: string = 'local') {
  
  const secretsManager = new SecretsManager(stage);
  const dbPassword = await secretsManager.get(DB_PASSWORD_PARAMETER_NAME);
  const outputs = await getStageOutputs(stage);
  
  if (stage === 'local') {
    await startPostgres(dbPassword);
  }

  await startPrismaStudio({
    username: outputs.postgresUsername,
    password: dbPassword,
    endpoint: outputs.postgresHost,
    port: outputs.postgresPort,
    dbName: outputs.postgresDBName,
    openBrowser: true,
  });
}

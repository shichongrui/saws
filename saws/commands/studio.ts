import { startPrismaStudio } from "../src/cli-commands/prisma";
import { DB_PASSWORD_PARAMETER_NAME } from "../src/utils/constants";
import { getSecretsManagerForStage } from "../src/secrets";
import { getStageOutputs } from "../src/utils/stage-outputs";

export async function startStudio(stage: string) {
  const secretsManager = getSecretsManagerForStage(stage);
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

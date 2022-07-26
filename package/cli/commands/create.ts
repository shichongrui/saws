import { randomUUID } from "crypto";
import { getDBPassword } from "../../utils/get-db-parameters";
import { getStageOutputs } from "../../utils/stage-outputs";
import { startPostgres } from "../cli-commands/postgres";
import { createPrismaMigration } from "../cli-commands/prisma";

export const create = async (createType: string, name?: string) => {
  switch (createType) {
    case 'migration':
      const password = await getDBPassword('local');
      await startPostgres(password);

      const outputs = await getStageOutputs('local');
      await createPrismaMigration({
        name: name ?? randomUUID(),
        username: outputs.postgresUsername,
        password,
        endpoint: outputs.postgresHost,
        port: outputs.postgresPort,
        dbName: outputs.postgresDBName,
      });
      return;
    default:
      throw new Error(`Type of ${createType} not supported`);
  }
}
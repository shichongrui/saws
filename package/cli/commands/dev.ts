import { startDevServer } from "../dev-server";
import { createCacheDir } from "../../utils/create-directories";
import { startWatcher } from "../watcher";
import { startPostgres } from "../cli-commands/postgres";
import { startPrismaStudio } from "../cli-commands/prisma";
import { getStageOutputs, writeStageOutputs } from "../../utils/stage-outputs";
import { startCognitoLocal } from "../cli-commands/cognito";
import { seedCognito } from "../../utils/seed-cognito";
import { getDBPassword } from "../../utils/get-db-parameters";

export async function startDev(entrypoint: string, stage: string = "local") {
  // because the api is currently run in the same node context
  // we need to set the environment variables for the handler
  // to pick them up
  const outputs = await getStageOutputs(stage);
  process.env = {
    ...process.env,
    NODE_ENV: "dev",
    STAGE: stage,
    DATABASE_USERNAME: outputs.postgresUsername,
    DATABASE_HOST: outputs.postgresHost,
    DATABASE_PORT: outputs.postgresPort,
    DATABASE_NAME: outputs.postgresDBName,
  }

  await createCacheDir();

  let handlerRef = { current: undefined };

  await startCognitoLocal();
  const cognitoInfo = await seedCognito(stage);

  const dbInfo = await startPostgres();
  const dbPassword = await getDBPassword();
  startPrismaStudio({
    username: outputs.postgresUsername,
    password: dbPassword,
    endpoint: outputs.postgresHost,
    port: outputs.postgresPort,
    dbName: outputs.postgresDBName,
  });
  await startWatcher(entrypoint, handlerRef);
  await startDevServer(
    handlerRef,
    cognitoInfo.userPool?.Id ?? "",
    cognitoInfo.accessToken ?? ""
  );

  await writeStageOutputs(
    {
      ...dbInfo,
      graphqlEndpoint: "http://localhost:8000",
      userPoolId: cognitoInfo.userPool?.Id ?? "",
      userPoolName: cognitoInfo.userPool?.Name ?? "",
      userPoolClientId: cognitoInfo.userPoolClient?.ClientId ?? "",
      userPoolClientName: cognitoInfo.userPoolClient?.ClientName ?? "",
      devUserEmail: cognitoInfo.devUserEmail,
    },
    "local"
  );

  console.log("GraphQL Endpoint:", "http://localhost:8000");
  console.log("GraphiQL Endpoint:", "http://localhost:8000/graphiql");
  console.log("Prisma Studio:", "http://localhost:5555");

  process.on("exit", () => process.exit());
  process.on("SIGINT", () => process.exit());
}

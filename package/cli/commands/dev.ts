import { createCacheDir } from "../../utils/create-directories";
import { startPostgres } from "../cli-commands/postgres";
import { startPrismaStudio } from "../cli-commands/prisma";
import { writeStageOutputs } from "../../utils/stage-outputs";
import { startCognitoLocal } from "../cli-commands/cognito";
import { seedCognito } from "../../utils/seed-cognito";
import { getDBPassword } from "../../utils/get-db-parameters";
import { findSawsModules } from "../../utils/find-saws-modules";
import { startAPIModule, startFunctionModule } from "../start-module";
import getModuleConfig from "../../utils/get-module-config";
import { ApiConfig, FunctionConfig, ModuleType } from "../../config";
import startLambdaServer from "../start-lambda-server";
import { getProjectName } from "../../utils/get-project-name";
import path from "path";
import { BUILD_DIR } from "../../utils/constants";

export async function startDev(stage: string = "local") {
  await createCacheDir();

  // start local infrastructure
  await startCognitoLocal();
  const cognitoInfo = await seedCognito(stage);

  const dbInfo = await startPostgres();
  const dbPassword = await getDBPassword();

  // with these started we should be able to write all the stage outputs
  const outputs = await writeStageOutputs(
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

  // because the api is currently run in the same node context
  // we need to set the environment variables for the handler
  // to pick them up
  process.env = {
    ...process.env,
    NODE_ENV: "dev",
    STAGE: stage,
    DATABASE_USERNAME: outputs.postgresUsername,
    DATABASE_HOST: outputs.postgresHost,
    DATABASE_PORT: outputs.postgresPort,
    DATABASE_NAME: outputs.postgresDBName,
    PROJECT_NAME: getProjectName(),
  };

  startPrismaStudio({
    username: outputs.postgresUsername,
    password: dbPassword,
    endpoint: outputs.postgresHost,
    port: outputs.postgresPort,
    dbName: outputs.postgresDBName,
  });

  const configPaths = await findSawsModules(".");
  const configs = await Promise.all(configPaths.map(getModuleConfig));
  const apiModules = configs.filter(
    (config) => config.type === ModuleType.API
  ) as ApiConfig[];
  const functionModules = configs.filter(
    (config) => config.type === ModuleType.FUNCTION
  ) as FunctionConfig[];

  // start all the functions
  await Promise.all(
    functionModules.map((config) => startFunctionModule(config))
  );

  // start all of the other modules first
  await startLambdaServer(functionModules);

  // start the api modules last
  await Promise.all(
    apiModules.map((config) =>
      startAPIModule(config, cognitoInfo.accessToken!, outputs)
    )
  );

  console.log("GraphQL Endpoint:", "http://localhost:8000");
  console.log("GraphiQL Endpoint:", "http://localhost:8000/graphiql");
  console.log("Prisma Studio:", "http://localhost:5555");
}

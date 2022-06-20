import { startDevServer } from "../src/dev-server";
import { createCacheDir } from "../src/utils/create-directories";
import { startWatcher } from "../src/watcher";
import { startPostgres } from '../src/cli-commands/postgres';
import { startPrismaStudio } from "../src/cli-commands/prisma";
import { writeStageOutputs } from "../src/utils/stage-outputs";

export async function startDev(entrypoint: string, stage: string = 'local') {
  // because the api is currently run in the same node context
  // we need to set the environment variables for the handler
  // to pick them up
  process.env.NODE_ENV = 'dev';
  process.env.STAGE = stage;
  
  await createCacheDir();

  let handlerRef = { current: undefined };

  const dbInfo = await startPostgres();
  startPrismaStudio({
    username: 'postgres',
    password: 'password',
    endpoint: 'localhost',
    port: '5432',
    dbName: 'postgres'
  });
  await startWatcher(entrypoint, handlerRef);
  await startDevServer(handlerRef);

  await writeStageOutputs({
    ...dbInfo,
    graphqlEndpoint: 'http://localhost:8000',
  }, 'local')

  console.log('GraphQL Endpoint:', 'http://localhost:8000');
  console.log('GraphiQL Endpoint:', 'http://localhost:8000/graphiql');
  console.log('Prisma Studio:', 'http://localhost:5555');
}

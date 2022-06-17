import { startDevServer } from "../src/dev-server";
import { createCacheDir } from "../src/utils/create-directories";
import { startWatcher } from "../src/watcher";
import { startPostgres } from '../src/cli-commands/postgres';
import { startPrismaStudio } from "../src/cli-commands/prisma";

export async function startDev(entrypoint: string) {
  process.env.NODE_ENV = 'dev';
  
  await createCacheDir();

  let handlerRef = { current: undefined };

  await startPostgres();
  startPrismaStudio({
    username: 'postgres',
    password: 'password',
    endpoint: 'localhost',
    port: '5432',
    dbName: 'postgres'
  });
  await startWatcher(entrypoint, handlerRef);
  await startDevServer(handlerRef);

  console.log('GraphQL Endpoint:', 'http://localhost:8000');
  console.log('GraphiQL Endpoint:', 'http://localhost:8000/graphiql');
  console.log('Prisma Studio:', 'http://localhost:5555');
}

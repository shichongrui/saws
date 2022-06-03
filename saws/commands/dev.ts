import { startDevServer } from "../src/dev-server";
import { createCacheDir } from "../src/utils/create-directories";
import { startWatcher } from "../src/watcher";
import { startPostgres } from '../src/cli-commands/postgres';

export async function startDev(entrypoint: string) {
  await createCacheDir();

  let handlerRef = { current: undefined };

  await startPostgres();
  await startWatcher(entrypoint, handlerRef);
  await startDevServer(handlerRef);
}

import { startDevServer } from "../lib/dev-server";
import { createCacheDir } from "../lib/create-directories";
import { startWatcher } from "../lib/watcher";
import { startPostgres } from '../lib/postgres';

export async function startDev(entrypoint: string) {
  await createCacheDir();

  let handlerRef = { current: undefined };

  await startPostgres();
  await startWatcher(entrypoint, handlerRef);
  await startDevServer(handlerRef);
}

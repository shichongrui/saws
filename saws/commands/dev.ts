import { startDevServer } from "../lib/dev-server";
import { createCacheDir } from "../lib/create-directories";
import { startWatcher } from "../lib/watcher";

export async function startDev(entrypoint: string) {
  await createCacheDir();

  let handlerRef = { current: undefined };

  startWatcher(entrypoint, handlerRef);
  startDevServer(handlerRef);
}

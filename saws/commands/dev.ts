import path from 'path';
import { startDevServer } from '../lib/dev-server';
import { CACHE_DIR } from '../lib/constants';
import { createCacheDir } from '../lib/create-cache-dir';
import { build } from '../lib/build';
import { startWatcher } from '../lib/watcher';

export async function startDev(entrypoint: string) {
    await createCacheDir();

    const entrypointFullPath = path.resolve(entrypoint);
    const fileName = path.parse(entrypoint).name;
    const outPath = path.resolve(CACHE_DIR, `${fileName}.js`);
    const module = require(outPath).default;
    let handlerRef = { current: module.apolloServer.createHandler() };

    startWatcher(handlerRef, outPath, async () => {
        await build({
            entryPoints: [entrypointFullPath],
            outPath,
        });
    });
    startDevServer(handlerRef);
}

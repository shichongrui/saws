import { promises as fs, constants } from 'fs'
import path from 'path';
import esbuild from 'esbuild';
import watch from 'node-watch';
import { startDevServer } from '../lib/dev-server';
import { CACHE_DIR } from '../lib/constants';
import { createCacheDir } from '../lib/create-cache-dir';
import { buildLambda } from '../lib/build';
import { startWatcher } from '../lib/watcher';

export async function startDev(entrypoint: string) {
    await createCacheDir();

    const entrypointFullPath = path.resolve(entrypoint);
    const fileName = path.parse(entrypoint).name;
    const outPath = path.resolve(CACHE_DIR, `${fileName}.js`);

    const buildResult = await buildLambda([entrypointFullPath], outPath);
    const module = require(outPath).default;
    let handlerRef = { current: module.apolloServer.createHandler() };

    startWatcher(handlerRef, outPath, async () => {
        await buildResult.rebuild()
    });
    startDevServer(handlerRef);
}

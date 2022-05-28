import path from "path";
import watch from "node-watch";
import { HandlerRef } from "./dev-server";
import { CACHE_DIR } from "./constants";
import { build } from "./build";
import { getBuildPaths } from "./get-build-paths";

export const startWatcher = async (
  entrypoint: string,
  handlerRef: HandlerRef
) => {
  const { entrypointPath, modulePath } = getBuildPaths(entrypoint);

  await build({
    entryPoints: [entrypointPath],
    modulePath,
  });
  handlerRef.current = require(modulePath).handler;

  watch(
    ".",
    {
      recursive: true,
      filter: (f, skip) => {
        // skip node_modules
        if (/node_modules/.test(f)) return skip;
        // skip .git folder
        if (/\.git/.test(f)) return skip;
        return true;
      },
    },
    async () => {
      console.log("Detected changes, rebuilding");
      await build({
        entryPoints: [entrypointPath],
        modulePath,
      });
      delete require.cache[require.resolve(modulePath)];
      handlerRef.current = require(modulePath).handler;
      console.log("ready");
    }
  );
};

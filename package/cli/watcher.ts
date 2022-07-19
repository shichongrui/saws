import watch from "node-watch";
import { HandlerRef } from "./dev-server";
import { build } from "./build";
import { getBuildPathsForEntrypoint } from "../utils/get-build-paths";
import { generatePrismaClient } from "./cli-commands/prisma";

export const startWatcher = async (
  entrypoint: string,
  handlerRef: HandlerRef
) => {
  const { entrypointPath, modulePath } = getBuildPathsForEntrypoint(entrypoint);

  await generatePrismaClient();

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
        if (/\.saws\//.test(f)) return skip;
        return true;
      },
    },
    async (_, filePath) => {
      console.log("Detected changes, rebuilding");

      if (/prisma/.test(filePath)) {
        console.log("Regenerating prisma client");
        await generatePrismaClient();
      }

      await build({
        entryPoints: [entrypointPath],
        modulePath,
      });
      delete require.cache[require.resolve(modulePath)];
      handlerRef.current = require(modulePath).handler;
    }
  );
};

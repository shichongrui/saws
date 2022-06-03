import path from "path";
import { CACHE_DIR } from "./constants";

export const getBuildPathsForEntrypoint = (entrypoint: string) => {
  const entrypointPath = path.resolve(entrypoint);
  const fileName = path.parse(entrypoint).name;
  const modulePath = path.resolve(CACHE_DIR, `${fileName}.js`);

  return {
    entrypointPath,
    modulePath,
  };
};

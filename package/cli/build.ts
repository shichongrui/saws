import esbuild from "esbuild";

let buildResult: esbuild.BuildResult;
export const buildLambda = async (
  entryPoints: string[],
  modulePath: string,
  incremental: boolean
) => {
  if (buildResult != null) {
    await buildResult.rebuild?.();
    return;
  }

  buildResult = await esbuild.build({
    entryPoints,
    bundle: true,
    outfile: modulePath,
    sourcemap: true,
    platform: "node",
    incremental,
  });
};

type BuildParameters = {
  entryPoints: string[];
  modulePath: string;
  incremental?: boolean;
};

export const build = async ({
  entryPoints,
  modulePath,
  incremental = true,
}: BuildParameters) => {
  await buildLambda(entryPoints, modulePath, incremental);
};

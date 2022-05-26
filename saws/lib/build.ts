import esbuild from 'esbuild';


let buildResult: esbuild.BuildIncremental;
export const buildLambda = async (entryPoints: string[], outPath: string) => {
    if (buildResult != null) {
        await buildResult.rebuild();
        return;
    }

    buildResult = await esbuild.build({
        entryPoints,
        bundle: true,
        outfile: outPath,
        platform: 'node',
        incremental: true,
    });
}

type BuildParameters = {
    entryPoints: string[],
    outPath: string,
}

export const build = async ({
    entryPoints,
    outPath,
}: BuildParameters) => {
    await buildLambda(entryPoints, outPath);
}

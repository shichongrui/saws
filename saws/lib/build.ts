import esbuild from 'esbuild';

export const buildLambda = (entryPoints: string[], outPath: string) => {
    return esbuild.build({
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

const build = async ({
    entryPoints,
    outPath,
}: BuildParameters) => {
    
}

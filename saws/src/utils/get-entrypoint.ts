import path from 'path';

export const getEntrypoint = () => {
    const packageJsonPath = path.resolve("./package.json");
    return require(packageJsonPath).main;
}
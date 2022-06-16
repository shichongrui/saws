import path from 'path';
import { Secrets } from "..";
import { startPrismaStudio } from "../src/cli-commands/prisma";
import { DB_PASSWORD_PARAMETER_NAME, SAWS_DIR } from "../src/utils/constants";
import { promises as fs } from 'fs';

process.env.NODE_ENV = 'prod';

export async function startStudio() {
    const dbPassword = await Secrets.get(DB_PASSWORD_PARAMETER_NAME);
    const outputs = JSON.parse(await fs.readFile(path.resolve(SAWS_DIR, 'saws-api-output.json'), { encoding: 'utf-8' }));

    const packageJsonPath = path.resolve("./package.json");
    const projectName = require(packageJsonPath).name;

    await startPrismaStudio({
        username: 'postgres',
        password: dbPassword,
        endpoint: outputs.SawsDBEndpoint,
        port: outputs.SawsDBPort,
        dbName: `${projectName}DB`.replace(/[^a-zA-Z\d]/g, ''),
        openBrowser: true,
    })
}
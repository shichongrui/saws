import path from 'path';
import { Secrets } from "..";
import { startPrismaStudio } from "../src/cli-commands/prisma";
import { DB_PASSWORD_PARAMETER_NAME, SAWS_DIR } from "../src/utils/constants";
import { promises as fs } from 'fs';
import { getDBName } from '../src/utils/get-db-name';

export async function startStudio(stage: string) {
    process.env.STAGE = stage;
    process.env.NODE_ENV = 'prod';
    const dbPassword = await Secrets.get(DB_PASSWORD_PARAMETER_NAME);
    const outputs = JSON.parse(await fs.readFile(path.resolve(SAWS_DIR, `saws-api-${stage}-output.json`), { encoding: 'utf-8' }));    

    await startPrismaStudio({
        username: 'postgres',
        password: dbPassword,
        endpoint: outputs.SawsDBEndpoint,
        port: outputs.SawsDBPort,
        dbName: getDBName(),
        openBrowser: true,
    })
}
import path from 'path';
import { promises as fs } from 'fs';
import { SAWS_DIR } from './constants';

export const getStageOutputs = async (stage: string) => {
    const outputsText = await fs.readFile(path.resolve(SAWS_DIR, `saws-api-${stage}-output.json`), { encoding: 'utf-8' });
    return JSON.parse(outputsText);
}
import { promises as fs, constants } from 'fs';
import { CACHE_DIR } from './constants';

export const createCacheDir = async () => {
    // check if the cache dir exists already or not
    // if not create it
    try {
        await fs.access(CACHE_DIR, constants.F_OK)
    } catch (err) {
        await fs.mkdir(CACHE_DIR, { recursive: true })
    }
}
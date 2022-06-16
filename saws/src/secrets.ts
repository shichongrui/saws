import { getParameter, putParameter } from "./aws/ssm";
import { Data, parse, stringify } from 'envfile';
import { promises as fs } from 'fs';

const getLocalSecrets = async () => {
    const secretsFile = await fs.readFile('./.secrets', { encoding: 'utf-8' });
    return parse(secretsFile);
}

const writeLocalSecrets = async (secrets: Data) => {
    const text = stringify(secrets);
    await fs.writeFile('./.secrets', text);
}

let cache: Record<string, string> = {};
export default {
    async get(name: string) {
        if (cache[name] != null) {
            cache[name];
        }
        
        if (process.env.NODE_ENV === 'prod') {
            const value = await getParameter(`/prod/${name}`, true);
            cache[name] = value;
            return value;
        } else {
            const cache = await getLocalSecrets();
            return cache[name];
        }
    },

    async set(name: string, value: string) {
        if (process.env.NODE_ENV === 'prod') {
            await putParameter(`/prod/${name}`, value, true);
        } else {
            const localSecrets = await getLocalSecrets();
            localSecrets[name] = value;
            await writeLocalSecrets(localSecrets);
        }
    }
}
import prompt from 'prompt';
import { Secrets } from '..';

export async function secret() {
    prompt.start();

    prompt.message = '';
    prompt.delimiter = '';

    const { name, value } = await prompt.get({
        properties: {
            name: {
                description: 'Secret name',
                required: true,
            },
            value: {
                description: 'Secret',
                // @ts-ignore
                hidden: true,
                replace: '*',
                required: true,
            }
        }
    });

    await Secrets.set(name.toString(), value.toString());
}
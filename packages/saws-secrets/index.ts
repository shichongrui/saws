import { SecretsManager } from './src/SecretsManager'

export { SecretsManager } from './src/SecretsManager'

export default new SecretsManager(process.env.STAGE!);

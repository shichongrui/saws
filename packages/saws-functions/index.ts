import FunctionsClient from './src/FunctionsClient'

export const Functions = new FunctionsClient(process.env.STAGE!);

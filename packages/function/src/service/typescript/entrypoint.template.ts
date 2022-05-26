export const entrypointTemplate = () => /* ts */`import type { Handler } from "aws-lambda";

export const handler: Handler = async (event, context) => {
  return { event, context };
};
`
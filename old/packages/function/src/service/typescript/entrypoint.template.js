"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.entrypointTemplate = void 0;
const entrypointTemplate = () => /* ts */ `import type { Handler } from "aws-lambda";

export const handler: Handler = async (event, context) => {
  return { event, context };
};
`;
exports.entrypointTemplate = entrypointTemplate;

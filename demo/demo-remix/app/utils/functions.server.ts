import { FunctionsClient } from "@saws/function/functions-client";

export const functionsClient = new FunctionsClient(process.env.STAGE!)
import { FunctionsClient } from "@shichongrui/saws-function/functions-client";

export const functionsClient = new FunctionsClient(process.env.STAGE!)
import { uppercase } from "./uppercase";

export const parameterizedEnvVarName = (name: string, variable: string) =>
  `${name.replace(/[^a-zA-Z\d]/g, "_").toUpperCase()}_${variable}`;

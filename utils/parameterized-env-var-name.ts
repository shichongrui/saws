import { uppercase } from "./uppercase";

export const parameterizedEnvVarName = (name: string, variable: string) =>
  `${uppercase(name.replace(/[^a-zA-Z\d]/g, "_"))}_${variable}`;

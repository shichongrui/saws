import { default as finder } from "find-package-json";

export const getProjectName = () => {
  const pkg = finder(import.meta.dirname).next().value;
  return pkg!.name!;
};

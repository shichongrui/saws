import { default as finder } from 'find-package-json'

export const getProjectName = () => {
  const pkg = finder(__dirname).next().value
  return pkg!.name!;
};

import path from "path";

export const getProjectName = () => {
  const packageJsonPath = path.resolve("./package.json");
  return require(packageJsonPath).name;
};

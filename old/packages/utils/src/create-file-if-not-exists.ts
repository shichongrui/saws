import fs from "node:fs";

export const createFileIfNotExists = (
  path: string,
  fileContents: string
) => {
  if (fs.existsSync(path)) return
  console.log('Writing', path)
  fs.writeFileSync(path, fileContents)
};

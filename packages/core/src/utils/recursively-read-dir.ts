import { promises as fs } from "fs";
import { resolve } from "path";

export const recursivelyReadDir = async (dir: string) => {
  const files: string[] = [];

  const dirContents = await fs.readdir(dir, { withFileTypes: true });
  for (const item of dirContents) {
    if (item.isDirectory()) {
      const nestedFiles = await recursivelyReadDir(resolve(dir, item.name));
      files.push(...nestedFiles);
      continue;
    }
    files.push(resolve(dir, item.name));
  }

  return files;
};

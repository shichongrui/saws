import { promises as fs } from 'fs';
import { resolve } from 'path';

export const recursivelyReadDir = async (path: string) => {
  const files: string[] = [];

  const dirContents = await fs.readdir(path, { withFileTypes: true });
  for (const item of dirContents) {
    if (item.isDirectory()) {
      const nestedFiles = await recursivelyReadDir(resolve(path, item.name))
      files.push(...nestedFiles)
      continue
    }
    files.push(resolve(path, item.name))
  }

  return files;
}
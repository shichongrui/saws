import { resolve } from "path";
import { promises as fs } from "fs";

const ignore = /(node_modules|\.git|\.saws)/g

export async function findSawsModules(
  dir: string
): Promise<string[]> {
  const dirents = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    dirents.map((dirent) => {
      const res = resolve(dir, dirent.name);
      if (dirent.name === 'saws-config.ts') return res;
      return dirent.isDirectory() && ignore.test(dirent.name) === false ? findSawsModules(res) : null;
    })
  );
  return Array.prototype.concat(...files).filter(Boolean);
}

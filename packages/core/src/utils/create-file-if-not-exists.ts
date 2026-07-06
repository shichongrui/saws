import * as fs from "node:fs/promises";

export async function createFileIfNotExists(path: string, contents: string) {
  try {
    await fs.writeFile(path, contents, { flag: "wx" });
  } catch (err) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      err.code === "EEXIST"
    ) {
      return false;
    }

    throw err;
  }
}

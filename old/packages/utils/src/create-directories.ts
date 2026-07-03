import { promises as fs, constants } from "node:fs";
import { BUILD_DIR, SAWS_DIR } from "./constants";

export const createCacheDir = async () => {
  // check if the cache dir exists already or not
  // if not create it
  try {
    await fs.access(BUILD_DIR, constants.F_OK);
  } catch (err) {
    await fs.mkdir(BUILD_DIR, { recursive: true });
  }
};

export const createSawsDir = async () => {
  try {
    await fs.access(SAWS_DIR, constants.F_OK);
  } catch (err) {
    await fs.mkdir(SAWS_DIR, { recursive: true });
  }
};

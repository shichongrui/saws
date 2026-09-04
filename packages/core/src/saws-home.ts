import os from "node:os";
import path from "node:path";

export function getSawsHome() {
  const configuredHome = process.env.SAWS_HOME;
  if (configuredHome != null && configuredHome.trim().length === 0) {
    throw new Error("SAWS_HOME cannot be empty");
  }
  return path.resolve(configuredHome ?? path.join(os.homedir(), ".saws"));
}

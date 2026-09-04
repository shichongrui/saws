import path from "node:path";
import { getSawsHome } from "@saws/core";

export function getAppsDirectory() {
  return path.join(getSawsHome(), "apps");
}

export function getAppDirectory(name: string) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name)) {
    throw new Error(
      "Application name must start with a letter or number and contain only letters, numbers, dots, underscores, or hyphens",
    );
  }

  return path.join(getAppsDirectory(), name);
}

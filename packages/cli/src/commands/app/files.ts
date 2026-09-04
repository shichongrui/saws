export function getPackageName(specifier: string) {
  const trimmed = specifier.trim();
  const match = /^(?<name>@[^/\s]+\/[^@/\s]+|[^@/\s]+)(?:@[^\s]+)?$/.exec(trimmed);
  const name = match?.groups?.name;
  if (name == null) {
    throw new Error(
      "Application package must be an npm package name with an optional version or tag",
    );
  }
  return name;
}

export function applicationWrapper(packageName: string) {
  return `import { createSawsConfig } from "@saws/core";
import config from "./config.ts";
import * as application from ${JSON.stringify(packageName)};

export * from "./config.ts";

export default await createSawsConfig(application, config);
`;
}

export function applicationConfig(packageName: string) {
  return `import type { create } from ${JSON.stringify(packageName)};

export default {
  // Configure this application instance here.
} satisfies Parameters<typeof create>[0];
`;
}

export async function pathExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}
import fs from "node:fs/promises";

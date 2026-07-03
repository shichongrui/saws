import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const rootDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

export async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

export async function getWorkspaces() {
  const rootPackage = await readJson(path.join(rootDirectory, "package.json"));
  const patterns = rootPackage.workspaces ?? [];

  if (
    patterns.length !== 1 ||
    patterns[0] !== "packages/*"
  ) {
    throw new Error(
      'The release scripts currently require workspaces: ["packages/*"].',
    );
  }

  const packageDirectories = (
    await readdir(path.join(rootDirectory, "packages"), { withFileTypes: true })
  ).filter((entry) => entry.isDirectory());
  const workspaces = packageDirectories.map(({ name }) => {
    const relativeDirectory = `packages/${name}`;
    return {
      directory: path.join(rootDirectory, relativeDirectory),
      manifestPath: path.join(rootDirectory, relativeDirectory, "package.json"),
      relativeDirectory,
    };
  });

  return Promise.all(
    workspaces.map(async (workspace) => ({
      ...workspace,
      manifest: await readJson(workspace.manifestPath),
    })),
  );
}

export const dependencyFields = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
];

export function parseVersion(version) {
  const match =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(
      version,
    );

  if (!match) {
    throw new Error(`Invalid semantic version: ${version}`);
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ?? null,
  };
}

export function assertConsistentVersions(workspaces) {
  if (workspaces.length === 0) {
    throw new Error("No publishable workspaces were found.");
  }

  const versions = new Set(workspaces.map(({ manifest }) => manifest.version));
  if (versions.size !== 1) {
    throw new Error(
      `Workspace versions are not synchronized: ${[...versions].join(", ")}`,
    );
  }

  const [version] = versions;
  parseVersion(version);
  const workspaceNames = new Set(
    workspaces.map(({ manifest }) => manifest.name),
  );

  for (const { manifest } of workspaces) {
    for (const field of dependencyFields) {
      for (const [name, range] of Object.entries(manifest[field] ?? {})) {
        if (workspaceNames.has(name) && range !== version) {
          throw new Error(
            `${manifest.name} has ${field}.${name}=${range}; expected ${version}.`,
          );
        }
      }
    }
  }

  return version;
}

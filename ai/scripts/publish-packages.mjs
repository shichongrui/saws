import { spawnSync } from "node:child_process";
import {
  assertConsistentVersions,
  dependencyFields,
  getWorkspaces,
  parseVersion,
} from "./workspaces.mjs";

const workspaces = await getWorkspaces();
const version = assertConsistentVersions(workspaces);
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const requestedTag =
  args.find((argument) => argument !== "--dry-run") ??
  process.env.GITHUB_REF_NAME;

if (!requestedTag) {
  throw new Error(
    `A release tag is required. Pass v${version} as the first argument.`,
  );
}

if (requestedTag !== `v${version}`) {
  throw new Error(
    `Release tag ${requestedTag} does not match package version v${version}.`,
  );
}

const byName = new Map(
  workspaces.map((workspace) => [workspace.manifest.name, workspace]),
);
const remaining = new Set(byName.keys());
const published = new Set();
const ordered = [];

while (remaining.size > 0) {
  const ready = [...remaining].filter((name) => {
    const { manifest } = byName.get(name);
    const internalDependencies = dependencyFields.flatMap((field) =>
      Object.keys(manifest[field] ?? {}).filter((dependency) =>
        byName.has(dependency),
      ),
    );
    return internalDependencies.every((dependency) => published.has(dependency));
  });

  if (ready.length === 0) {
    throw new Error(
      `Circular workspace dependency detected among: ${[...remaining].join(", ")}`,
    );
  }

  ready.sort();
  for (const name of ready) {
    ordered.push(byName.get(name));
    published.add(name);
    remaining.delete(name);
  }
}

const { prerelease } = parseVersion(version);
const npmTag = prerelease?.split(".")[0] ?? "latest";

console.log(
  `Publishing ${ordered.length} packages at ${version} with npm tag "${npmTag}":`,
);
console.log(ordered.map(({ manifest }) => `  ${manifest.name}`).join("\n"));

for (const { manifest } of ordered) {
  const result = spawnSync(
    "npm",
    [
      "publish",
      "--workspace",
      manifest.name,
      "--access",
      "public",
      "--tag",
      npmTag,
      ...(dryRun ? ["--dry-run"] : []),
    ],
    { stdio: "inherit" },
  );

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

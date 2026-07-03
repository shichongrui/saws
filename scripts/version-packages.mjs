import { writeFile } from "node:fs/promises";
import path from "node:path";
import {
  assertConsistentVersions,
  dependencyFields,
  getWorkspaces,
  parseVersion,
  readJson,
  rootDirectory,
} from "./workspaces.mjs";

const usage = `Usage:
  npm run version:bump -- <version>
  npm run version:bump -- major|minor|patch
  npm run version:bump -- premajor|preminor|prepatch|prerelease [--preid beta]
  npm run version:bump -- beta

Examples:
  npm run version:bump -- 1.0.0
  npm run version:bump -- patch
  npm run version:bump -- preminor
  npm run version:bump -- beta`;

const args = process.argv.slice(2);
const requested = args[0];
const preidIndex = args.indexOf("--preid");
const preid = preidIndex === -1 ? "beta" : args[preidIndex + 1];

if (!requested || !preid || !/^[0-9A-Za-z-]+$/.test(preid)) {
  console.error(usage);
  process.exit(1);
}

function nextVersion(current, increment) {
  if (/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(increment)) {
    parseVersion(increment);
    return increment;
  }

  const parsed = parseVersion(current);
  let { major, minor, patch } = parsed;
  const prerelease = parsed.prerelease?.split(".") ?? [];

  if (increment === "major") {
    if (!(parsed.prerelease && minor === 0 && patch === 0)) major += 1;
    minor = 0;
    patch = 0;
    return `${major}.${minor}.${patch}`;
  }
  if (increment === "minor") {
    if (!(parsed.prerelease && patch === 0)) minor += 1;
    patch = 0;
    return `${major}.${minor}.${patch}`;
  }
  if (increment === "patch") {
    if (!parsed.prerelease) patch += 1;
    return `${major}.${minor}.${patch}`;
  }

  if (increment === "premajor") {
    return `${major + 1}.0.0-${preid}.0`;
  }
  if (increment === "preminor") {
    return `${major}.${minor + 1}.0-${preid}.0`;
  }
  if (increment === "prepatch") {
    return `${major}.${minor}.${patch + 1}-${preid}.0`;
  }
  if (increment === "prerelease" || increment === "beta") {
    const id = increment === "beta" ? "beta" : preid;
    if (!parsed.prerelease) {
      return `${major}.${minor}.${patch + 1}-${id}.0`;
    }
    if (prerelease[0] !== id) {
      return `${major}.${minor}.${patch}-${id}.0`;
    }

    const last = prerelease.at(-1);
    const nextPrerelease =
      last && /^\d+$/.test(last)
        ? [...prerelease.slice(0, -1), String(Number(last) + 1)]
        : [...prerelease, "0"];
    return `${major}.${minor}.${patch}-${nextPrerelease.join(".")}`;
  }

  throw new Error(`Unknown version increment: ${increment}\n\n${usage}`);
}

const workspaces = await getWorkspaces();
const current = assertConsistentVersions(workspaces);
const version = nextVersion(current, requested);
const workspaceNames = new Set(workspaces.map(({ manifest }) => manifest.name));

for (const workspace of workspaces) {
  workspace.manifest.version = version;
  for (const field of dependencyFields) {
    for (const name of Object.keys(workspace.manifest[field] ?? {})) {
      if (workspaceNames.has(name)) {
        workspace.manifest[field][name] = version;
      }
    }
  }
  await writeFile(
    workspace.manifestPath,
    `${JSON.stringify(workspace.manifest, null, 2)}\n`,
  );
}

const lockPath = path.join(rootDirectory, "package-lock.json");
const lock = await readJson(lockPath);
for (const workspace of workspaces) {
  const entry = lock.packages[workspace.relativeDirectory];
  entry.version = version;
  for (const field of dependencyFields) {
    for (const name of Object.keys(entry[field] ?? {})) {
      if (workspaceNames.has(name)) {
        entry[field][name] = version;
      }
    }
  }
}
await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`);

console.log(`Updated ${workspaces.length} packages from ${current} to ${version}.`);

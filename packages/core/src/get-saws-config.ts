import { pathToFileURL } from "node:url";
import path from "node:path";
import { access, rm, writeFile } from "node:fs/promises";
import ts from "typescript";
import type { ServiceDefinition } from "./service-definition.js";

export async function getSawsConfig(
  configPath?: string
): Promise<ServiceDefinition> {
  const resolvedPath = await resolveConfigPath(configPath);
  const importPath = resolvedPath.endsWith(".ts")
    ? await transpileConfig(resolvedPath)
    : resolvedPath;

  try {
    const moduleUrl = pathToFileURL(importPath).href;
    const imported = await import(`${moduleUrl}?t=${Date.now()}`);
    const serviceDefinition = imported.default ?? imported;

    if (serviceDefinition == null || typeof serviceDefinition.deploy !== "function") {
      throw new Error(
        `Expected ${resolvedPath} to export a ServiceDefinition as the default export`
      );
    }

    return serviceDefinition as ServiceDefinition;
  } finally {
    if (importPath !== resolvedPath) {
      await rm(importPath, { force: true });
    }
  }
}

async function resolveConfigPath(configPath?: string) {
  if (configPath != null) return path.resolve(configPath);

  for (const candidate of ["./saws.ts", "./saws.js"]) {
    const resolved = path.resolve(candidate);
    try {
      await access(resolved);
      return resolved;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  return path.resolve("./saws.ts");
}

async function transpileConfig(configPath: string) {
  const outputPath = path.join(
    path.dirname(configPath),
    `.saws-${path.basename(configPath, ".ts")}-${process.pid}-${Date.now()}.mjs`
  );
  const source = await ts.sys.readFile(configPath);
  if (source == null) {
    throw new Error(`Unable to read ${configPath}`);
  }

  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      esModuleInterop: true,
    },
    fileName: configPath,
  });

  await writeFile(outputPath, transpiled.outputText);
  return outputPath;
}

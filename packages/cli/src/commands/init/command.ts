import path from "node:path";
import fs from "node:fs/promises";
import { findServiceDefinition, getSawsConfig } from "@saws/core";
import { installDependencies } from "@saws/core/utils/dependency-management";
import { createFileIfNotExists } from "@saws/core/utils/create-file-if-not-exists";
import { sawsTsTemplate } from "./templates/saws-ts.template.js";
import { tsconfigJsonTemplate } from "./templates/tsconfig-json.template.js";
import { gitignoreTemplate } from "./templates/gitignore.template.js";

export const initCommand = async (serviceName?: string, configPath?: string) => {
  if (serviceName != null) {
    const serviceDefinition = await getSawsConfig(configPath);
    await findServiceDefinition(serviceDefinition, serviceName).init();
    return;
  }

  const name = path.parse(path.resolve(".")).name;

  // not used for now
  await installDependencies([]);
  await installDependencies(["@saws/core", "typescript", "@tsconfig/node26"], {
    development: true,
  });

  await fs.writeFile("./tsconfig.json", tsconfigJsonTemplate(), {});
  await createFileIfNotExists("./saws.ts", sawsTsTemplate({ name }));
  await createFileIfNotExists("./.gitignore", gitignoreTemplate());
};

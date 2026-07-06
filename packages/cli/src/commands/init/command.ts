import path from "node:path";
import fs from "node:fs/promises";
import { installDependencies } from "@saws/core/utils/dependency-management";
import { createFileIfNotExists } from "@saws/core/utils/create-file-if-not-exists";
import { sawsTsTemplate } from "./templates/saws-ts.template.js";
import { tsconfigJsonTemplate } from "./templates/tsconfig-json.template.js";
import { gitignoreTemplate } from "./templates/gitignore.template.js";

export const initCommand = async () => {
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

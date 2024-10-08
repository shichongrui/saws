import path from "node:path";
import crypto from "node:crypto";
import AdmZip from "adm-zip";
import { BUILD_DIR } from "./constants";
import { promises as fs } from "node:fs";

export const buildCodeZip = async (
  modulePath: string,
  {
    name,
    include = [],
    hasExternalModules = false,
    includePrisma = false,
  }: {
    name: string;
    include: string[];
    hasExternalModules: boolean;
    includePrisma: boolean;
  }
) => {
  const zip = new AdmZip();

  zip.addLocalFile(modulePath);

  const parsedModulePath = path.parse(modulePath);
  const sourceMapPath = path.join(
    parsedModulePath.dir,
    `${parsedModulePath.name}.js.map`
  );
  zip.addLocalFile(sourceMapPath);

  // add externals
  if (hasExternalModules) {
    zip.addLocalFolder(
      path.resolve(parsedModulePath.dir, "node_modules"),
      "node_modules"
    );
  }

  if (include.length > 0) {
    for (const filePath of include) {
      const fullPath = path.resolve(parsedModulePath.dir, filePath);
      const stat = await fs.stat(fullPath);
      if (stat.isDirectory()) {
        zip.addLocalFolder(fullPath, filePath);
      } else {
        const directory = path.parse(filePath).dir;
        zip.addLocalFile(fullPath, directory);
      }
    }
  }

  if (includePrisma) {
    zip.addLocalFile(
      path.resolve(
        "node_modules",
        ".prisma",
        "client",
        "libquery_engine-rhel-openssl-3.0.x.so.node"
      ),
      "node_modules/.prisma/client"
    );

    zip.addLocalFile(
      path.resolve("prisma", "schema.prisma"),
      "node_modules/.prisma/client"
    );
  }

  // If we don't clear the dates on each entry, then we get a different hash each time
  // even if all of the file contents are the same
  zip.getEntries().forEach((e) => (e.header.time = new Date("2022-06-17")));

  const hash = crypto.createHash("md5").update(zip.toBuffer()).digest("hex");
  const key = `${name}-${hash}.zip`;
  const zipPath = path.resolve(BUILD_DIR, key);
  await zip.writeZipPromise(zipPath);

  return zipPath;
};

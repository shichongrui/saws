import path from 'path';
import crypto from 'crypto';
import { promises as fs } from 'fs';
import AdmZip from "adm-zip";
import { CACHE_DIR } from './constants';

export const buildCodeZip = async (modulePath: string, projectName: string) => {
  const zip = new AdmZip();
  
  zip.addLocalFile(modulePath);
  zip.addLocalFile(
    path.resolve(
      "node_modules",
      ".prisma",
      "client",
      "libquery_engine-rhel-openssl-1.0.x.so.node"
    ),
    "node_modules/.prisma/client"
  );
  zip.addLocalFile(
    path.resolve("prisma", "schema.prisma"),
    "node_modules/.prisma/client"
  );
  
  // If we don't clear the dates on each entry, then we get a different hash each time
  // even if all of the file contents are the same
  zip.getEntries().forEach(e => e.header.time = new Date('2022-06-17'));

  const hash = crypto.createHash("md5").update(zip.toBuffer()).digest("hex");
  const key = `${projectName}-${hash}.zip`;
  const zipPath = path.resolve(CACHE_DIR, key);
  await zip.writeZipPromise(zipPath);

  return zipPath;
};

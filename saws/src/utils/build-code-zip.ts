import path from 'path';
import crypto from 'crypto';
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

  const hash = crypto.createHash("md5").update(zip.toBuffer()).digest("hex");
  const key = `${projectName}-${hash}.zip`;
  const zipPath = path.resolve(CACHE_DIR, key);
  await zip.writeZipPromise(zipPath);

  return zipPath;
};

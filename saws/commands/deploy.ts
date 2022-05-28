import path from "path";
import { promises as fs } from 'fs';
import { build } from "../lib/build";
import { deployStack } from "../lib/cloudformation";
import { createCacheDir, createSawsDir } from "../lib/create-directories";
import { getBuildPaths } from "../lib/get-build-paths";
import { uploadFile } from "../lib/s3";
import sawsResourcesTemplate from "../resources/saws-resources.template";
import AdmZip from "adm-zip";
import { CACHE_DIR, SAWS_DIR } from "../lib/constants";
import { sawsApiTemplate } from "../resources/saws-api.template";
import crypto from "crypto";

export async function deploy(entrypoint: string) {
  await createSawsDir();
  await createCacheDir();

  // first step is to build
  console.log("Building...");
  const { entrypointPath, modulePath } = getBuildPaths(entrypoint);
  const moduleName = path.parse(modulePath).name;
  await build({
    entryPoints: [entrypointPath],
    modulePath,
    incremental: false,
  });

  const packageJsonPath = path.resolve("./package.json");
  const projectName = require(packageJsonPath).name;
  const bucketName = `${projectName}-saws-api`;

  // create S3 bucket if it does not exist
  await deployStack(
    `${projectName}-saws-resources`,
    sawsResourcesTemplate({
      bucketName,
    })
  );

  // upload build to S3
  console.log("Uploading api...");  
  const zip = new AdmZip();
  zip.addLocalFile(modulePath);

  const hash = crypto.createHash('md5').update(zip.toBuffer()).digest("hex")
  const key = `${moduleName}-${hash}.zip`;
  const zipPath = path.resolve(CACHE_DIR, key);
  await zip.writeZipPromise(zipPath);
  await uploadFile(bucketName, key, zipPath);

  // Create Lambda and API Gateway
  console.log("Creating api...");
  const results = await deployStack(
    `${projectName}-saws-api`,
    sawsApiTemplate({
      functionName: `${projectName}-api`,
      moduleName,
      codeBucketName: bucketName,
      codeS3Key: key,
    })
  );

  // write outputs
  const outputs = results?.Stacks?.[0].Outputs?.reduce<Record<string, unknown>>((acc, output) => {
    const key = output.OutputKey ?? 'key';
    acc[key] = output.OutputValue;
    return acc;
  }, {});
  await fs.writeFile(path.resolve(SAWS_DIR, 'saws-api-output.json'), JSON.stringify(outputs));
}

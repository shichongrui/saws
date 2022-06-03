import path from "path";
import { promises as fs } from 'fs';
import { build } from "../src/build";
import { deployStack } from "../src/aws/cloudformation";
import { createCacheDir, createSawsDir } from "../src/utils/create-directories";
import { getBuildPathsForEntrypoint } from "../src/utils/get-build-paths";
import { uploadFile } from "../src/aws/s3";
import sawsResourcesTemplate from "../templates/saws-resources.template";
import AdmZip from "adm-zip";
import { CACHE_DIR, SAWS_DIR } from "../src/utils/constants";
import { sawsApiTemplate } from "../templates/saws-api.template";
import crypto from "crypto";
import { deployPrismaMigrate } from "../src/cli-commands/prisma";
import { getDefaultVPCId } from "../src/aws/ec2";
import { getDBPassword } from "../src/utils/get-db-password";

export async function deploy(entrypoint: string) {
  await createSawsDir();
  await createCacheDir();

  // first step is to build
  console.log("Building...");
  const { entrypointPath, modulePath } = getBuildPathsForEntrypoint(entrypoint);
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
  zip.addLocalFile(path.resolve("node_modules", ".prisma", "client", "libquery_engine-rhel-openssl-1.0.x.so.node"), "node_modules/.prisma/client")
  zip.addLocalFile(path.resolve("prisma", "schema.prisma"), "node_modules/.prisma/client")

  const hash = crypto.createHash('md5').update(zip.toBuffer()).digest("hex")
  const key = `${moduleName}-${hash}.zip`;
  const zipPath = path.resolve(CACHE_DIR, key);
  await zip.writeZipPromise(zipPath);
  await uploadFile(bucketName, key, zipPath);

  // Create Lambda and API Gateway
  console.log("Creating api...");
  const defaultVpcId = await getDefaultVPCId();
  const dbPassword = await getDBPassword();

  const results = await deployStack(
    `${projectName}-saws-api`,
    sawsApiTemplate({
      functionName: `${projectName}-api`,
      moduleName,
      codeBucketName: bucketName,
      codeS3Key: key,
      dbName: `${projectName}DB`.replace(/[^a-zA-Z\d]/g, ''),
      dbUsername: 'postgres',
      dbPassword: dbPassword,
      vpcId: defaultVpcId,
    })
  );

  // write outputs
  const outputs = results?.Stacks?.[0].Outputs?.reduce<Record<string, unknown>>((acc, output) => {
    const key = output.OutputKey ?? 'key';
    acc[key] = output.OutputValue;
    return acc;
  }, {});
  await fs.writeFile(path.resolve(SAWS_DIR, 'saws-api-output.json'), JSON.stringify(outputs, null, 2));

  await deployPrismaMigrate({
    username: 'postgres',
    password: dbPassword,
    endpoint: outputs?.SawsDBEndpoint as string,
    port: outputs?.SawsDBPort as string,
    dbName: `${projectName}DB`.replace(/[^a-zA-Z\d]/g, ''),
  });
}

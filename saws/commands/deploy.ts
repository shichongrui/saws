import path from "path";
import { promises as fs } from "fs";
import { build } from "../src/build";
import { deployStack } from "../src/aws/cloudformation";
import { createCacheDir, createSawsDir } from "../src/utils/create-directories";
import { getBuildPathsForEntrypoint } from "../src/utils/get-build-paths";
import { uploadFile } from "../src/aws/s3";
import sawsResourcesTemplate from "../templates/saws-resources.template";
import AdmZip from "adm-zip";
import {
  CACHE_DIR,
  DB_PASSWORD_PARAMETER_NAME,
  SAWS_DIR,
} from "../src/utils/constants";
import { sawsApiTemplate } from "../templates/saws-api.template";
import crypto from "crypto";
import { prismaMigrate } from "../src/cli-commands/prisma";
import { getDefaultVPCId } from "../src/aws/ec2";
import { getDBPassword } from "../src/utils/get-db-password";
import { getProjectName } from "../src/utils/get-project-name";
import { buildCodeZip } from "../src/utils/build-code-zip";
import { getDBName } from "../src/utils/get-db-name";

export async function deploy(entrypoint: string, stage: string) {
  process.env.STAGE = stage;
  process.env.NODE_ENV = "prod";

  await createSawsDir();
  await createCacheDir();

  const projectName = getProjectName();
  const bucketName = `${projectName}-${stage}-saws`;

  // create S3 bucket if it does not exist
  console.log("Creating resources for SAWS");
  await deployStack(
    `${projectName}-${stage}-saws-resources`,
    sawsResourcesTemplate({
      bucketName,
    })
  );

  // first step is to build
  console.log("Building...");
  const { entrypointPath, modulePath } = getBuildPathsForEntrypoint(entrypoint);
  await build({
    entryPoints: [entrypointPath],
    modulePath,
    incremental: false,
  });

  // upload build to S3
  console.log("Uploading api...");
  const zipPath = await buildCodeZip(modulePath, projectName);
  const key = path.parse(zipPath).base;
  await uploadFile(bucketName, key, zipPath);

  // Create Lambda and API Gateway
  console.log("Creating api...");
  const defaultVpcId = await getDefaultVPCId();
  const dbPassword = await getDBPassword();

  const results = await deployStack(
    `${projectName}-${stage}-saws-api`,
    sawsApiTemplate({
      moduleName: path.parse(modulePath).name,
      projectName,
      codeBucketName: bucketName,
      codeS3Key: key,
      dbName: getDBName(),
      dbUsername: "postgres",
      dbPasswordParameterName: DB_PASSWORD_PARAMETER_NAME,
      vpcId: defaultVpcId,
      stage,
    })
  );

  // write outputs
  const outputs: Record<string, unknown> = {
    ...results?.Stacks?.[0].Outputs?.reduce<Record<string, unknown>>(
      (acc, output) => {
        const key = output.OutputKey ?? "key";
        acc[key] = output.OutputValue;
        return acc;
      },
      {}
    ),
    postgresDBName: getDBName(),
    postgresUsername: 'postgres',
  };
  await fs.writeFile(
    path.resolve(SAWS_DIR, `saws-api-${stage}-output.json`),
    JSON.stringify(outputs, null, 2)
  );

  await prismaMigrate({
    username: outputs.postgresUsername as string,
    password: dbPassword,
    endpoint: outputs.postgresHost as string,
    port: outputs.postgresPort as string,
    dbName: outputs.postgresDBName as string,
  });

  console.log("GraphQL Endpoint:", outputs.graphqlEndpoint);
  console.log("Postgres Host:", outputs.postgresHost);
  console.log("Postgres Port:", outputs.postgresPort);
  console.log("Postgres Username:", outputs.postgresUsername);
  console.log("Postgres DB Name:", outputs.postgresDBName);
}

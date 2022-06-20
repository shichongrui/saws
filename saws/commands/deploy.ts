import path from "path";
import { promises as fs } from "fs";
import { build } from "../src/build";
import { deployStack } from "../src/aws/cloudformation";
import { createCacheDir, createSawsDir } from "../src/utils/create-directories";
import { getBuildPathsForEntrypoint } from "../src/utils/get-build-paths";
import { doesFileExist, uploadFile } from "../src/aws/s3";
import sawsResourcesTemplate from "../templates/saws-resources.template";
import { DB_PASSWORD_PARAMETER_NAME } from "../src/utils/constants";
import { sawsApiTemplate } from "../templates/saws-api.template";
import { prismaMigrate } from "../src/cli-commands/prisma";
import { getDefaultVPCId } from "../src/aws/ec2";
import { getProjectName } from "../src/utils/get-project-name";
import { buildCodeZip } from "../src/utils/build-code-zip";
import { getDBParameters } from "../src/utils/get-db-parameters";
import { Outputs, writeStageOutputs } from "../src/utils/stage-outputs";

export async function deploy(entrypoint: string, stage: string) {
  if (stage === "local") {
    console.warn("Can not deploy to local stage");
    process.exit();
  }

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
  const fileExists = await doesFileExist(bucketName, key);
  if (!fileExists) {
    await uploadFile(bucketName, key, zipPath);
  }

  // Create Lambda and API Gateway
  console.log("Creating api...");
  const defaultVpcId = await getDefaultVPCId();
  const {
    username: dbUsername,
    name: dbName,
    password: dbPassword,
  } = await getDBParameters(stage);

  const results = await deployStack(
    `${projectName}-${stage}-saws-api`,
    sawsApiTemplate({
      moduleName: path.parse(modulePath).name,
      projectName,
      codeBucketName: bucketName,
      codeS3Key: key,
      dbName: dbName,
      dbUsername: dbUsername,
      dbPasswordParameterName: DB_PASSWORD_PARAMETER_NAME,
      vpcId: defaultVpcId,
      stage,
    })
  );

  // write outputs
  type StackOutputKey = "postgresHost" | "postgresPort" | "graphqlEndpoint";
  const outputs = {
    ...results?.Stacks?.[0].Outputs?.reduce<Pick<Outputs, StackOutputKey>>((acc, output) => {
      const key = output.OutputKey as StackOutputKey;
      acc[key] = output.OutputValue!;
      return acc;
    }, { postgresHost: '', postgresPort: '', graphqlEndpoint: '' }),
    postgresDBName: dbName,
    postgresUsername: dbUsername,
  };
  await writeStageOutputs(outputs, stage);

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

import path from "path";
import { build } from "../build";
import { CloudFormation } from "../../aws/cloudformation";
import { S3 } from '../../aws/s3';
import { EC2 } from '../../aws/ec2';
import { createCacheDir, createSawsDir } from "../../utils/create-directories";
import { getBuildPathsForEntrypoint } from "../../utils/get-build-paths";
import sawsResourcesTemplate, { getStackName as getResourcesStackName } from "../templates/saws-resources.template";
import sawsApiTemplate, { getStackName as getApiStackName } from "../templates/saws-api.template";
import { DB_PASSWORD_PARAMETER_NAME } from "../../utils/constants";
import { prismaMigrate } from "../cli-commands/prisma";
import { getProjectName } from "../../utils/get-project-name";
import { buildCodeZip } from "../../utils/build-code-zip";
import { getDBParameters } from "../../utils/get-db-parameters";
import { Outputs, writeStageOutputs } from "../../utils/stage-outputs";

export async function deploy(entrypoint: string, stage: string) {
  const cloudformationClient = new CloudFormation();
  const s3Client = new S3();
  const ec2Client = new EC2();

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
  const defaultVpcId = await ec2Client.getDefaultVPCId();
  const {
    username: dbUsername,
    name: dbName,
    password: dbPassword,
  } = await getDBParameters(stage);
  const resourcesStackResults = await cloudformationClient.deployStack(
    getResourcesStackName(stage),
    sawsResourcesTemplate({
      bucketName,
      stage,
      dbUsername,
      dbName,
      dbPasswordParameterName: DB_PASSWORD_PARAMETER_NAME,
      vpcId: defaultVpcId,
      projectName,
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
  const fileExists = await s3Client.doesFileExist(bucketName, key);
  if (!fileExists) {
    await s3Client.uploadFile(bucketName, key, zipPath);
  }

  // Create Lambda and API Gateway
  console.log("Creating api...");

  const apiStackResults = await cloudformationClient.deployStack(
    getApiStackName(stage),
    sawsApiTemplate({
      moduleName: path.parse(modulePath).name,
      projectName,
      codeBucketName: bucketName,
      codeS3Key: key,
      dbName: dbName,
      dbUsername: dbUsername,
      stage,
      resourcesStackName: getResourcesStackName(stage),
    })
  );

  // write outputs
  type StackOutputKey = "postgresHost" | "postgresPort" | "graphqlEndpoint" | "userPoolId" | "userPoolClientId" | "userPoolName" | "userPoolClientName";
  const allOutputs = [
    ...apiStackResults?.Stacks?.[0].Outputs ?? [],
    ...resourcesStackResults?.Stacks?.[0].Outputs ?? [],
  ];
  const outputs = {
    ...allOutputs.reduce<Pick<Outputs, StackOutputKey>>(
      (acc, output) => {
        const key = output.OutputKey as StackOutputKey;
        acc[key] = output.OutputValue!;
        return acc;
      },
      { postgresHost: "", postgresPort: "", graphqlEndpoint: "", userPoolId: "", userPoolClientId: "", userPoolName: "", userPoolClientName: "" }
    ),
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

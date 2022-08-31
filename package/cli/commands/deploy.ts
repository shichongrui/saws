import path from "path";
import { build } from "../build";
import { CloudFormation } from "../../aws/cloudformation";
import { S3 } from "../../aws/s3";
import { EC2 } from "../../aws/ec2";
import { createCacheDir, createSawsDir } from "../../utils/create-directories";
import { getBuildPathsForEntrypoint } from "../../utils/get-build-paths";
import sawsResourcesTemplate, {
  getStackName as getResourcesStackName,
} from "../templates/saws-resources.template";
import sawsApiTemplate, {
  getStackName as getApiStackName,
} from "../templates/saws-api.template";
import { BUILD_DIR, DB_PASSWORD_PARAMETER_NAME } from "../../utils/constants";
import { prismaMigrate } from "../cli-commands/prisma";
import { getProjectName } from "../../utils/get-project-name";
import { buildCodeZip } from "../../utils/build-code-zip";
import { getDBParameters } from "../../utils/get-db-parameters";
import { Outputs, writeStageOutputs } from "../../utils/stage-outputs";
import { findSawsModules } from "../../utils/find-saws-modules";
import getModuleConfig from "../../utils/get-module-config";
import { ApiConfig, FunctionConfig, ModuleType } from "../../config";
import getAwsAccountId from "../../utils/get-aws-account-id";
import {
  buildImage,
  loginToAWSDocker,
  pushImage,
  tagImage,
} from "../cli-commands/docker";
import sawsFunctionTemplate, {
  getFunctionStackName,
} from "../templates/saws-function.template";
import { npmInstall } from "../cli-commands/npm";

export async function deploy(stage: string) {
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

  const configPaths = await findSawsModules(".");
  const configs = await Promise.all(configPaths.map(getModuleConfig));

  const functionConfigs = configs.filter(
    ({ type }) => type === ModuleType.FUNCTION
  ) as FunctionConfig[];
  const apiConfigs = configs.filter(
    ({ type }) => type === ModuleType.API
  ) as ApiConfig[];

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
      containerFunctionNames: functionConfigs.map(({ name }) => name),
    })
  );

  const accountId = await getAwsAccountId();
  if (accountId == null) throw new Error("No account Id found");
  await loginToAWSDocker(accountId);
  for (const config of functionConfigs) {
    await buildImage(config.name, config.rootDir!);
    await tagImage(config.name, accountId, `${config.name}-${stage}`, "latest");
    await pushImage(accountId, `${config.name}-${stage}`, "latest");
    await cloudformationClient.deployStack(
      getFunctionStackName(config, stage),
      sawsFunctionTemplate({
        config,
        repositoryName: `${config.name}-${stage}`,
        tag: "latest",
        projectName,
        stage,
      })
    );
  }

  // first step is to build
  console.log("Building...");
  const entrypoint = path.join(apiConfigs[0].rootDir!, "index.ts");
  const { entrypointPath, modulePath } = getBuildPathsForEntrypoint(entrypoint);
  await build({
    entryPoints: [entrypointPath],
    modulePath,
    incremental: false,
  });

  // for external node modules, we need to re-install them so that we get
  // them and all their dependencies
  await npmInstall('jsdom', path.resolve(BUILD_DIR));

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
      functionNames: functionConfigs.map(({ name }) => name),
    })
  );

  // write outputs
  type StackOutputKey =
    | "postgresHost"
    | "postgresPort"
    | "graphqlEndpoint"
    | "userPoolId"
    | "userPoolClientId"
    | "userPoolName"
    | "userPoolClientName";
  const allOutputs = [
    ...(apiStackResults?.Stacks?.[0].Outputs ?? []),
    ...(resourcesStackResults?.Stacks?.[0].Outputs ?? []),
  ];
  const outputs = {
    ...allOutputs.reduce<Pick<Outputs, StackOutputKey>>(
      (acc, output) => {
        const key = output.OutputKey as StackOutputKey;
        acc[key] = output.OutputValue!;
        return acc;
      },
      {
        postgresHost: "",
        postgresPort: "",
        graphqlEndpoint: "",
        userPoolId: "",
        userPoolClientId: "",
        userPoolName: "",
        userPoolClientName: "",
      }
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

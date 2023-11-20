import { ChildProcess } from "child_process";
import path from "path";
import { getStackName, getTemplate } from "./cloud-formation.template";
import {
  getStackName as getS3StackName,
  getTemplate as getS3Template,
} from "./s3-cloud-formation.template";
import { watch } from "chokidar";
import esbuild from "esbuild";
import { buildCodeZip } from "../../../utils/build-code-zip";
import { FunctionService, FunctionServiceConfig } from "../FunctionService";
import { BUILD_DIR } from "../../../utils/constants";
import { lambdaServer } from "../../../utils/LambdaServer";
import { CloudFormation } from "../../../helpers/aws/cloudformation";
import { S3 } from "../../../helpers/aws/s3";
import { getProjectName } from "../../../utils/get-project-name";
import { npmInstall } from "../../../helpers/npm";

export interface TypescriptFunctionServiceConfig extends FunctionServiceConfig {
  triggers?: {
    cron?: string;
  };
  externalPackages?: string[];
}

export class TypescriptFunctionService extends FunctionService {
  process?: ChildProcess;
  triggers?: TypescriptFunctionServiceConfig["triggers"];

  // buildResults?: esbuild.BuildResult;
  buildContext?: esbuild.BuildContext;
  handlerRef?: any;
  entryPointPath: string;
  buildFilePath: string;
  externalPackages: string[];

  constructor(config: TypescriptFunctionServiceConfig) {
    super(config);

    this.triggers = config.triggers;

    this.entryPointPath = path.resolve(this.rootDir, "index.ts");
    this.buildFilePath = path.resolve(BUILD_DIR, this.name, "index.js");
    this.externalPackages = config.externalPackages ?? [];
  }

  async build() {
    try {
      if (this.buildContext != null) {
        await this.buildContext.rebuild?.();
        return;
      }

      this.buildContext = await esbuild.context({
        entryPoints: [this.entryPointPath],
        bundle: true,
        outfile: this.buildFilePath,
        sourcemap: true,
        platform: "node",
        external: this.externalPackages,
      });
      await this.buildContext.rebuild();
    } catch (err) {
      console.error(err);
    }
  }

  async dev() {
    console.log("Building function", this.name);
    await this.build();
    this.captureHandlerRef();
    watch(this.rootDir, { ignoreInitial: true }).on("all", async (...args) => {
      console.log(`Detected changes in ${this.name}. Rebuilding...`);
      await this.build();
      this.captureHandlerRef();
    });
    await lambdaServer.start();
  }

  captureHandlerRef() {
    delete require.cache[require.resolve(this.buildFilePath)];
    this.handlerRef = require(this.buildFilePath).handler;
  }

  async deploy(stage: string) {
    console.log(`Creating bucket to store ${this.name} code in`);
    // create s3 bucket
    const cloudformationClient = new CloudFormation();
    const s3Client = new S3();

    const projectName = getProjectName();
    const bucketName = `${projectName}-${stage}-${this.name}`;

    const s3Template = getS3Template({ bucketName });
    const s3StackName = getS3StackName(stage, this.name);

    await cloudformationClient.deployStack(s3StackName, s3Template);

    console.log("Deploying function", this.name);

    await this.build();
    this.buildContext?.dispose();

    // for external node modules, we need to re-install them so that we get
    // them and all their dependencies
    if (this.externalPackages.length > 0) {
      await npmInstall(
        this.externalPackages.join(" "),
        path.parse(this.buildFilePath).dir
      );
    }

    // upload build to S3
    console.log("Uploading", this.name);
    const zipPath = await buildCodeZip(this.buildFilePath, {
      name: this.name,
      hasExternalModules: this.externalPackages.length > 0,
    });
    const key = path.parse(zipPath).base;
    const fileExists = await s3Client.doesFileExist(bucketName, key);
    if (!fileExists) {
      await s3Client.uploadFileFromPath(bucketName, key, zipPath);
    }

    console.log("Deploying", this.name);

    let environment = {};
    for (const dependency of this.dependencies) {
      environment = {
        ...environment,
        ...(await dependency.getEnvironmentVariables()),
      };
    }

    const permissions = this.dependencies
      .map((dependency) => dependency.getPermissions(stage))
      .flat();

    const template = getTemplate({
      name: this.name,
      stage,
      moduleName: path.parse(this.buildFilePath).name,
      projectName,
      codeBucketName: bucketName,
      codeS3Key: key,
      permissions: [...permissions, ...this.getPermissions(stage)],
      environment,
      triggers: this.triggers,
    });
    const stackName = getStackName(stage, this.name);
    const results = await cloudformationClient.deployStack(stackName, template);
    const outputs = results?.Stacks?.[0].Outputs;

    await this.setOutputs(
      {
        ...Object.fromEntries(
          outputs?.map(({ OutputKey, OutputValue }) => [
            OutputKey,
            OutputValue,
          ]) ?? []
        ),
      },
      stage
    );

    return;
  }

  async getEnvironmentVariables() {
    return {
      [this.parameterizedEnvVarName("PROJECT_NAME")]: getProjectName(),
    };
  }

  getStdOut() {
    return this.process?.stdout;
  }

  exit() {
    this.buildContext?.dispose();
    this.buildContext = undefined;

    this.process?.kill();
    this.process = undefined;
  }
}
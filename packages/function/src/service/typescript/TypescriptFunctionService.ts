import path from "path";
import { getStackName, getTemplate } from "./cloud-formation.template";
import {
  getStackName as getS3StackName,
  getTemplate as getS3Template,
} from "./s3-cloud-formation.template";
import { watch } from "chokidar";
import esbuild from "esbuild";
import { buildCodeZip } from "@shichongrui/saws-utils/build-code-zip";
import { BUILD_DIR } from "@shichongrui/saws-utils/constants";
import {
  installMissingDependencies,
  npmInstallDependency,
} from "@shichongrui/saws-utils/dependency-management";
import { FunctionService, FunctionServiceConfig } from "../FunctionService";
import { lambdaServer } from "@shichongrui/lambda-server";
import { CloudFormation } from "@shichongrui/saws-aws/cloudformation";
import { S3 } from "@shichongrui/saws-aws/s3";
import fse from "fs-extra";
import fs from "node:fs";
import { createFileIfNotExists } from '@shichongrui/saws-utils/create-file-if-not-exists'
import { entrypointTemplate } from "./entrypoint.template";

export interface TypescriptFunctionServiceConfig extends FunctionServiceConfig {
  triggers?: {
    cron?: string;
  };
  externalPackages?: string[];
  include: string[];
}

export class TypescriptFunctionService extends FunctionService {
  triggers?: TypescriptFunctionServiceConfig["triggers"];

  // buildResults?: esbuild.BuildResult;
  buildContext?: esbuild.BuildContext;
  handlerRef?: any;
  entryPointPath: string;
  buildFilePath: string;
  externalPackages: string[];
  include: string[];

  constructor(config: TypescriptFunctionServiceConfig) {
    super({
      ...config,
      runtime: "typescript",
    });

    this.triggers = config.triggers;

    this.entryPointPath = path.resolve(this.rootDir, "index.ts");
    this.buildFilePath = path.resolve(BUILD_DIR, this.name, "index.js");
    this.externalPackages = config.externalPackages ?? [];
    this.include = config.include ?? [];
  }

  async init() {
    await installMissingDependencies(["aws-lambda"]);
    await installMissingDependencies(["@types/aws-lambda"], { development: true })

    fs.mkdirSync(path.resolve(this.name), { recursive: true });

    await createFileIfNotExists(path.resolve(this.name, 'index.ts'), entrypointTemplate())
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
        external: ["@aws-sdk", ...this.externalPackages],
        loader: { ".node": "file" },
      });
      await this.buildContext.rebuild();

      for (const includePath of this.include) {
        await fse.copy(
          path.resolve(this.rootDir, includePath),
          path.resolve(BUILD_DIR, this.name, includePath)
        );
      }
    } catch (err) {
      console.error(err);
    }
  }

  async registerFunction() {
    await lambdaServer.registerFunction({
      type: "javascript",
      name: this.name,
      path: this.buildFilePath,
      environment: {
        NODE_ENV: "development",
        ...(await this.getDependenciesEnvironmentVariables("local")),
      },
    });
  }

  async dev() {
    await super.dev();

    console.log("Building function", this.name);
    await this.build();
    await this.registerFunction();
    watch(this.rootDir, { ignoreInitial: true }).on("all", async (...args) => {
      console.log(`Detected changes in ${this.name}. Rebuilding...`);
      await this.build();
      await this.registerFunction();
    });
    await lambdaServer.start();
  }

  async deploy(stage: string) {
    await super.deploy(stage);

    const layerTemplates = await Promise.all(
      this.layers.map((layerArn) => this.getLayerTemplate(layerArn, stage))
    );

    console.log(`Creating bucket to store ${this.name} code in`);
    // create s3 bucket
    const cloudformationClient = new CloudFormation();
    const s3Client = new S3();

    const bucketName = `${stage}-${this.name}-code`.toLowerCase();

    const s3Template = getS3Template({ bucketName });
    const s3StackName = getS3StackName(stage, this.name);

    await cloudformationClient.deployStack(s3StackName, s3Template);

    console.log("Deploying function", this.name);

    await this.build();
    this.buildContext?.dispose();

    // for external node modules, we need to re-install them so that we get
    // them and all their dependencies
    if (this.externalPackages.length > 0) {
      await npmInstallDependency(this.externalPackages.join(" "), {
        cwd: path.parse(this.buildFilePath).dir,
      });
    }

    // upload build to S3
    console.log("Uploading", this.name);
    const zipPath = await buildCodeZip(this.buildFilePath, {
      name: this.name,
      include: this.include,
      hasExternalModules: this.externalPackages.length > 0,
    });
    const key = path.parse(zipPath).base;
    const fileExists = await s3Client.doesFileExist(bucketName, key);
    if (!fileExists) {
      await s3Client.uploadFileFromPath(bucketName, key, zipPath);
    }

    console.log("Deploying", this.name);

    let environment = await this.getDependenciesEnvironmentVariables(stage);

    const permissions = this.dependencies
      .map((dependency) => dependency.getPermissions(stage))
      .flat();

    const template = getTemplate({
      name: this.name,
      stage,
      moduleName: path.parse(this.buildFilePath).name,
      codeBucketName: bucketName,
      codeS3Key: key,
      permissions: [...permissions, ...this.getPermissions(stage)],
      environment,
      triggers: this.triggers,
      layers: layerTemplates,
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

  async getEnvironmentVariables(_: string) {
    return {};
  }

  getStdOut() {
    return null;
  }

  exit() {
    this.buildContext?.dispose();
    this.buildContext = undefined;
  }
}

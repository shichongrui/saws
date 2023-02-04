import { ModuleType, WebsiteConfig } from "../../../config";
import { ModuleDefinition, Outputs } from "../ModuleDefinition";
import getPort from "get-port";
import path from "path";
import { getStackName, getTemplate } from "./cloudfront.template";
import { getProjectName } from "../../../utils/get-project-name";
import { CloudFormation } from "../../../aws/cloudformation";
import { S3 } from "../../../aws/s3";
import { createServer, build } from "vite";
import { recursivelyReadDir } from "../../utils/recursively-read-dir";
import { promises as fs } from "fs";
import { BUILD_DIR } from "../../../utils/constants";
import {
  getStackName as getS3StackName,
  getTemplate as getS3Template,
} from "./s3-cloud-formation.template";
import { CloudFrontClient } from "@aws-sdk/client-cloudfront";
import { Cloudfront } from "../../../aws/cloudfront";
import { string } from "yargs";

export class Website implements ModuleDefinition, WebsiteConfig {
  type: ModuleType.WEBSITE = ModuleType.WEBSITE;
  outputs: Outputs = {};
  name: string;
  displayName: string;
  port?: number;
  rootDir: string;
  domain: string;
  config: WebsiteConfig;
  dependencies: ModuleDefinition[];

  constructor(
    name: string,
    config: WebsiteConfig,
    dependencies: ModuleDefinition[]
  ) {
    this.name = name;
    this.displayName = config.displayName ?? name;
    this.rootDir = path.resolve(".", config.rootDir ?? name);
    this.domain = config.domain ?? `${name}.saws`;
    this.config = config;
    this.dependencies = dependencies;
  }

  async writeEnvVarFile(stage: string, nodeEnv: "development" | "production") {
    const environmentVariables = this.dependencies.reduce(
      (acc, d) => {
        return {
          ...acc,
          ...d.getEnvironmentVariables(),
        };
      },
      { ...(this.config.env ?? {}) }
    );

    const envFileContents =
      Object.entries(environmentVariables)
        .map(([key, value]) => `VITE_${key}=${value}\n`)
        .join("") + `NODE_ENV=${nodeEnv}\n`;
    await fs.writeFile(
      path.resolve(this.rootDir, `.env.${stage}`),
      envFileContents,
      "utf-8"
    );
  }

  async dev() {
    console.log("Starting", this.displayName);

    await this.writeEnvVarFile("dev", "development");

    this.port = await getPort({ port: this.config.port });

    const server = await createServer({
      root: this.rootDir,
      clearScreen: false,
      mode: "dev",
      envDir: this.rootDir,
      server: {
        port: this.port,
      },
    });

    await server.listen();

    this.setOutputs({
      websiteUrl: server.resolvedUrls?.local[0],
    });
    console.log(
      `${this.displayName} website is at ${server.resolvedUrls?.local[0]}`
    );
  }

  async deploy(stage: string) {
    console.log("Deploying", this.displayName);

    await this.writeEnvVarFile(stage, "production");

    const cloudformationClient = new CloudFormation();
    const s3Client = new S3();

    const s3StackName = getS3StackName(stage, this.name);
    const s3Template = getS3Template({
      name: this.name,
      stage,
      domain: this.domain,
    });

    const results = await cloudformationClient.deployStack(
      s3StackName,
      s3Template
    );
    const outputs = results?.Stacks?.[0].Outputs;

    this.setOutputs({
      ...Object.fromEntries(
        outputs?.map(({ OutputKey, OutputValue }) => [
          OutputKey,
          OutputValue,
        ]) ?? []
      ),
    });

    const allFiles = await recursivelyReadDir(this.rootDir);
    const allHtmlFiles = allFiles.filter((f) => f.endsWith(".html"));

    const buildDir = path.resolve(BUILD_DIR, this.name);
    await build({
      root: this.rootDir,
      mode: stage,
      envDir: this.rootDir,
      build: {
        outDir: buildDir,
        emptyOutDir: true,
        rollupOptions: {
          input: allHtmlFiles.reduce((acc, f) => {
            const relativePath = f.replace(this.rootDir + "/", "");
            const parsedPath = path.parse(relativePath);
            const key = [parsedPath.dir, parsedPath.name].filter(Boolean).join('-')
            acc[key] = f;
            return acc;
          }, {} as Record<string, string>),
        },
      },
    });

    console.log("Uploading", this.displayName);
    const files = await recursivelyReadDir(buildDir);

    await Promise.all(
      files.map((file) =>
        s3Client.uploadFile(this.domain, file.replace(buildDir + "/", ""), file)
      )
    );

    if (this.domain != null && this.config.certificateArn != null) {
      const template = getTemplate({
        domain: this.domain,
        certificateArn: this.config.certificateArn,
        s3WebsiteUrl: String(this.outputs.websiteS3Url),
      });
      const stackName = getStackName(stage, this.name);

      const results = await cloudformationClient.deployStack(
        stackName,
        template
      );

      const cloudfrontOutputs = results?.Stacks?.[0].Outputs;
      this.setOutputs({
        ...Object.fromEntries(
          cloudfrontOutputs?.map(({ OutputKey, OutputValue }) => [
            OutputKey,
            OutputValue,
          ]) ?? []
        ),
      });

      const cloudfrontClient = new Cloudfront();
      await cloudfrontClient.createInvalidation(
        String(this.outputs.distributionId),
        "/*"
      );
    }
  }

  setOutputs(outputs: Outputs) {
    this.outputs = {
      ...this.outputs,
      ...outputs,
    };
  }

  getOutputs() {
    return this.outputs;
  }

  getEnvironmentVariables() {
    return {};
  }

  getStdOut() {
    return null;
  }

  exit() {}
}

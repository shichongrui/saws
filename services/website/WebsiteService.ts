import getPort from "get-port";
import path from "path";
import { getStackName, getTemplate } from "./cloudfront.template";
import { createServer, build } from "vite";
import { recursivelyReadDir } from "../../utils/recursively-read-dir";
import { promises as fs } from "fs";
import {
  getStackName as getS3StackName,
  getTemplate as getS3Template,
} from "./s3-cloud-formation.template";
import { ServiceDefinition, ServiceDefinitionConfig } from "../ServiceDefinition";
import { CloudFormation } from "../../helpers/aws/cloudformation";
import { S3 } from "../../helpers/aws/s3";
import { BUILD_DIR } from "../../utils/constants";
import { Cloudfront } from "../../helpers/aws/cloudfront";

interface WebsiteServiceConfig extends ServiceDefinitionConfig {
  port?: number;
  rootDir?: string;
  domain?: string;
  env?: Record<string, string>;
  certificateArn?: string;
}

export class WebsiteService extends ServiceDefinition {
  configPort?: number;
  port?: number;
  rootDir: string;
  domain: string;
  env: Record<string, string>;
  certificateArn?: string;

  constructor(
    config: WebsiteServiceConfig
  ) {
    super(config)
    this.rootDir = path.resolve(".", config.rootDir ?? this.name);
    this.domain = config.domain ?? `${name}.saws`;
    this.env = config.env ?? {};
    this.configPort = config.port;
    this.certificateArn = config.certificateArn;
  }

  async writeEnvVarFile(stage: string, nodeEnv: "development" | "production") {
    const environmentVariables = this.env;
    for (const dependency of this.dependencies) {
      Object.assign(
        environmentVariables,
        await dependency.getEnvironmentVariables(stage)
      );
    }

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
    await super.dev()
     

    await this.writeEnvVarFile("dev", "development");

    this.port = await getPort({ port: this.configPort });

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

    await this.setOutputs({
      websiteUrl: server.resolvedUrls?.local[0],
    }, 'local');
    console.log(
      `${this.name} website is at ${server.resolvedUrls?.local[0]}`
    );

    process.env = {
      ...process.env,
      ...(await this.getEnvironmentVariables('local'))
    }
  }

  async deploy(stage: string) {
    await super.deploy(stage)
    

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

    await this.setOutputs({
      ...Object.fromEntries(
        outputs?.map(({ OutputKey, OutputValue }) => [
          OutputKey,
          OutputValue,
        ]) ?? []
      ),
    }, stage);

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
            const key = [parsedPath.dir, parsedPath.name]
              .filter(Boolean)
              .join("-");
            acc[key] = f;
            return acc;
          }, {} as Record<string, string>),
        },
      },
    });

    console.log("Uploading", this.name);
    const files = await recursivelyReadDir(buildDir);

    await Promise.all(
      files.map((file) =>
        s3Client.uploadFileFromPath(this.domain, file.replace(buildDir + "/", ""), file)
      )
    );

    if (this.domain != null && this.certificateArn != null) {
      const template = getTemplate({
        domain: this.domain,
        certificateArn: this.certificateArn,
        s3WebsiteUrl: String(this.outputs.websiteS3Url),
      });
      const stackName = getStackName(stage, this.name);

      const results = await cloudformationClient.deployStack(
        stackName,
        template
      );

      const cloudfrontOutputs = results?.Stacks?.[0].Outputs;
      await this.setOutputs({
        ...Object.fromEntries(
          cloudfrontOutputs?.map(({ OutputKey, OutputValue }) => [
            OutputKey,
            OutputValue,
          ]) ?? []
        ),
      }, stage);

      const cloudfrontClient = new Cloudfront();
      await cloudfrontClient.createInvalidation(
        String(this.outputs.distributionId),
        "/*"
      );
    }
  }

  
  async getEnvironmentVariables(_: string) {
    return {};
  }

  getStdOut() {
    return null;
  }

  getPermissions(_: string) {
    return [];
  }

  exit() {}
}

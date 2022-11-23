import { ModuleType, WebsiteConfig } from "../../../config";
import { ModuleDefinition, Outputs } from "../ModuleDefinition";
import http, { IncomingMessage, OutgoingMessage, ServerResponse } from "http";
import getPort from "get-port";
import path from "path";
import { Server as FileServer } from "node-static";
import { getStackName, getTemplate } from "./cloud-formation.template";
import { getProjectName } from "../../../utils/get-project-name";
import { CloudFormation } from "../../../aws/cloudformation";
import { S3 } from "../../../aws/s3";
import fs from "fs";
import { recursivelyReadDir } from "../../utils/recursively-read-dir";

export class Website implements ModuleDefinition, WebsiteConfig {
  type: ModuleType.WEBSITE = ModuleType.WEBSITE;
  outputs: Outputs = {};
  name: string;
  displayName: string;
  port?: number;
  rootDir: string;
  domain: string;
  config: WebsiteConfig;

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
  }

  async dev() {
    await new Promise(async (resolve) => {
      console.log("Starting", this.displayName);
      this.port = await getPort({ port: this.config.port });

      const fileServer = new FileServer(this.rootDir, { cache: 0 });

      const server = http.createServer(
        (req: IncomingMessage, res: ServerResponse) => {
          fileServer.serve(req, res);
        }
      );

      server.listen(this.port, "0.0.0.0", () => {
        this.setOutputs({
          websiteUrl: `http://localhost:${this.port}`,
        });
        console.log(
          `${this.displayName} website is at http://localhost:${this.port}`
        );
        resolve(null);
      });
    });
  }

  async deploy(stage: string) {
    console.log("Deploying", this.displayName);
    const bucketName = `${getProjectName()}-${stage}-${this.name}`;

    const template = getTemplate({
      name: this.name,
      stage,
      domain: this.domain,
      certificateArn: this.config.certificateArn,
      isCustomDomain: this.config.domain != null,
    });
    const stackName = getStackName(stage, this.name);

    const cloudformationClient = new CloudFormation();
    const s3Client = new S3();

    const results = await cloudformationClient.deployStack(stackName, template);

    const outputs = results?.Stacks?.[0].Outputs;

    this.setOutputs({
      ...Object.fromEntries(
        outputs?.map(({ OutputKey, OutputValue }) => [
          OutputKey,
          OutputValue,
        ]) ?? []
      ),
    });

    console.log("Uploading", this.displayName);
    const files = await recursivelyReadDir(this.rootDir);
    await Promise.all(
      files.map((file) => {
        [
          s3Client.uploadFile(
            this.domain,
            file.replace(this.rootDir + "/", ""),
            file
          ),
          s3Client.uploadFile(
            `www.${this.domain}`,
            file.replace(this.rootDir + "/", ""),
            file
          ),
        ];
      }).flat()
    );
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

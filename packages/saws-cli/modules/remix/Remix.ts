import { ModuleDefinition, Outputs } from "../ModuleDefinition";
import {
  ModuleType,
  RemixConfig,
  getProjectName,
} from "@shichongrui/saws-core";
import path from "path";
import { BUILD_DIR } from "@shichongrui/saws-core";
import { watch } from "chokidar";
import getPort from "get-port";
import http, { IncomingMessage, ServerResponse } from "http";
import mime from "mime-types";
import { promises as fs } from "fs";
import esbuild from "esbuild";
import { transformRequestToLambdaEvent } from "../../utils/transform-incoming-message-to-lambda-event";
import { copyDirectory } from "../../utils/copy-directory";
import WebSocket from "ws";
import { CloudFormation, Cloudfront, S3 } from "@shichongrui/saws-aws";
import {
  getTemplate as getS3CodeTemplate,
  getStackName as getS3CodeStackName,
} from "./code-s3-cloud-formation.template";
import { getTemplate, getStackName } from "./cloud-formation.template";
import { buildCodeZip } from "../../utils/build-code-zip";
import { recursivelyReadDir } from "../../utils/recursively-read-dir";

import { build as remixBuild } from "@remix-run/dev/dist/cli/commands";
import { readConfig } from "@remix-run/dev/dist/config";
import { createFileWatchCache } from "@remix-run/dev/dist/compiler/fileWatchCache";
import * as compiler from "@remix-run/dev/dist/compiler/compiler";
import { logger } from "@remix-run/dev/dist/tux/logger";
import fse from "fs-extra";

export class Remix implements ModuleDefinition, RemixConfig {
  type: ModuleType.REMIX = ModuleType.REMIX;
  name: string;
  displayName: string;
  config: RemixConfig;
  dependencies: ModuleDefinition[];
  rootDir: string;
  buildFilePath: string;
  handlerRef?: any;
  port?: number;
  buildContext?: esbuild.BuildContext;
  entryPointPath: string;
  outputs: Outputs = {};
  remixCompiler: any;

  constructor(
    name: string,
    config: RemixConfig,
    dependencies: ModuleDefinition[]
  ) {
    this.name = name;
    this.displayName = config.displayName ?? this.name;
    this.config = config;
    this.dependencies = dependencies;
    this.rootDir = path.resolve(".", config.rootDir ?? this.name);
    this.buildFilePath = path.resolve(BUILD_DIR, this.name, "index.js");
    this.entryPointPath = path.resolve(this.rootDir, "index.ts");
  }

  // the default remix build command has a few implications
  // 1. it does a process.exit(1) on any build failures
  // 2. it doesn't dispose of the compiler and thus it hangs
  // So we are building it ourselves based on how it works but without that stuff
  async buildRemix(mode: "development" | "production") {
    // if (this.remixCompiler != null) {
    //   console.log('Existing remix compiler')
    //   await this.remixCompiler.compile();
    //   return;
    // }

    let config = await readConfig(path.resolve("."));
    const port = await this.getPort();
    let options = {
      mode,
      sourcemap: mode === "development",
      REMIX_DEV_ORIGIN:
        mode === "development"
          ? new URL(`http://localhost:${port}`)
          : undefined,
    };

    let fileWatchCache = createFileWatchCache();
    
    fse.emptyDirSync(config.assetsBuildDirectory);
    
    this.remixCompiler = await compiler.create({
      config,
      options,
      fileWatchCache,
      logger,
    });
    await this.remixCompiler.compile();
    await this.remixCompiler.dispose();
  }

  async build(mode: "development" | "production" = "development") {
    try {
      await this.buildRemix(mode);
      
      await copyDirectory(
        path.join(this.rootDir, "public"),
        path.resolve(BUILD_DIR, this.name, "public")
      );
        
      if (this.buildContext != null) {
        await this.buildContext.rebuild?.();
        return;
      }
      
      this.buildContext = await esbuild.context({
        minify: mode === "production",
        entryPoints: [this.entryPointPath],
        bundle: true,
        outfile: this.buildFilePath,
        sourcemap: true,
        platform: "node",
      });
      await this.buildContext.rebuild();
    } catch (err) {
      this.buildContext?.dispose()
      this.buildContext = undefined
      this.remixCompiler.dispose()
      this.remixCompiler = null
      console.error('Remix build error', err);
    }
  }

  async dev() {
    for (const dependency of this.dependencies) {
      process.env = {
        ...process.env,
        ...(await dependency.getEnvironmentVariables()),
      };
    }

    console.log("Building remix app", this.displayName);

    let wss = new WebSocket.Server({ port: 8002 });
    function broadcast(event: { type: string } & Record<string, unknown>) {
      setTimeout(() => {
        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(event));
          }
        });
      }, 500);
    }

    await this.build();
    this.captureHandlerRef();

    broadcast({ type: "RELOAD" });
    watch(this.rootDir, {
      ignoreInitial: true,
      ignored: [path.join(this.rootDir, "build")],
    }).on("all", async (...args) => {
      console.log(`Detected changes in ${this.displayName}. Rebuilding...`);
      debugger
      await this.build();
      this.captureHandlerRef();
      broadcast({ type: "RELOAD" });
      console.log('Built')
    });

    await this.startDevServer();
  }

  captureHandlerRef() {
    const modulePath = path.resolve(BUILD_DIR, this.name);
    for (const key of Object.keys(require.cache)) {
      if (key.startsWith(modulePath)) {
        delete require.cache[key];
      }
    }
    this.handlerRef = require(this.buildFilePath).handler;
  }

  async startDevServer() {
    console.log("Starting remix server", this.displayName);

    return new Promise(async (resolve) => {
      const port = await this.getPort();

      const server = http.createServer(
        async (req: IncomingMessage, res: ServerResponse) => {
          if (req.method === "GET" && req.url?.startsWith("/public")) {
            try {
              const file = await fs.readFile(
                path.join(BUILD_DIR, this.name, req.url!)
              );
              const contentType =
                mime.lookup(req.url!) || "application/octet-stream";
              res.writeHead(200, { "Content-Type": contentType });
              if (
                contentType.startsWith("text") ||
                contentType === "application/javascript" ||
                contentType === "application/json"
              ) {
                res.end(file, "utf-8");
              } else {
                res.end(file);
              }
              return;
            } catch (err) {
              res.writeHead(404, { "Content-Type": "text/plain" });
              res.end("404 Not Found");
              return;
            }
          }
          try {
            const context = {
              callbackWaitsForEmptyEventLoop: true,
              functionName: "saws-api",
              functionVersion: "1",
              invokedFunctionArn: "aws:local:function",
              memoryLimitInMB: "128",
              awsRequestId: "1234",
              logGroupName: "asdf",
              logStreamName: "asdf",
              getRemainingTimeInMillis: () => 1234,
              done: () => {},
              fail: () => {},
              succeed: () => {},
            };

            const results = await this.handlerRef(
              await transformRequestToLambdaEvent(req),
              context,
              () => {}
            );

            const headers = {
              ...results.headers,
              ...results.multiValueHeaders,
            };

            if (results.cookies?.length > 0) {
              headers["set-cookie"] = results.cookies.join("; ");
            }

            res.writeHead(results.statusCode, headers);
            res.end(results.body);
          } catch (err) {
            console.log(err);
            res.writeHead(500);
            res.end();
          }
        }
      );

      server.listen(port, "0.0.0.0", () => {
        this.setOutputs({
          remixEndpoint: `http://localhost:${port}`,
        });
        console.log(`${this.name} Endpoint:`, `http://localhost:${port}`);
        resolve(null);
      });
    });
  }

  async getPort() {
    if (this.port != null) return this.port;
    this.port = await getPort({ port: this.config.port });
    return this.port;
  }

  async deploy(stage: string) {
    console.log(`Creating bucket to store ${this.displayName} code in`);
    // create s3 bucket
    const cloudformationClient = new CloudFormation();
    const s3Client = new S3();

    const projectName = getProjectName();
    const bucketName = `${projectName}-${stage}-${this.name}-code`;

    const s3Template = getS3CodeTemplate({ bucketName, name: this.name });
    const s3StackName = getS3CodeStackName(stage, this.name);

    await cloudformationClient.deployStack(s3StackName, s3Template);

    console.log("Deploying function", this.displayName);

    await this.build("production");
    await this.remixCompiler.dispose()
    this.buildContext?.dispose();

    // upload build to S3
    console.log("Uploading", this.displayName);
    const zipPath = await buildCodeZip(this.buildFilePath, {
      name: this.name,
      hasExternalModules: false,
    });
    const key = path.parse(zipPath).base;
    const fileExists = await s3Client.doesFileExist(bucketName, key);
    if (!fileExists) {
      await s3Client.uploadFileFromPath(bucketName, key, zipPath);
    }

    console.log("Deploying", this.displayName);

    let environment = {};
    for (const dependency of this.dependencies) {
      environment = {
        ...environment,
        ...(await dependency.getEnvironmentVariables()),
      };
    }

    const permissions = this.dependencies
      .map((dependency) =>
        dependency.getPermissions(this.type, process.env.STAGE!)
      )
      .flat();

    const template = getTemplate({
      name: this.name,
      stage,
      moduleName: path.parse(this.buildFilePath).name,
      projectName,
      codeBucketName: bucketName,
      codeS3Key: key,
      permissions: [
        ...permissions,
        ...this.getPermissions(ModuleType.REMIX, stage),
      ],
      environment,
    });
    const stackName = getStackName(stage, this.name);
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

    const publicBuildDir = path.resolve(BUILD_DIR, this.name, "public");
    const publicFiles = await recursivelyReadDir(publicBuildDir);

    for (const file of publicFiles) {
      await s3Client.uploadFileFromPath(
        `${this.name}-resources-${stage}`,
        file.replace(path.resolve(BUILD_DIR, this.name) + "/", ""),
        file
      );
    }

    const cloudfrontClient = new Cloudfront();
    await cloudfrontClient.createInvalidation(
      String(this.outputs.distributionId),
      "/*"
    );

    return;
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

  async getEnvironmentVariables() {
    return {};
  }

  getStdOut() {
    return null;
  }

  getPermissions(dependantType: ModuleType, stage: string) {
    return [];
  }

  exit() {}
}

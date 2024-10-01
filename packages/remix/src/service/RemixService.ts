import { buildCodeZip } from "@saws/utils/build-code-zip";
import { BUILD_DIR } from "@saws/utils/constants";
import { copyDirectory } from "@saws/utils/copy-directory";
import { recursivelyReadDir } from "@saws/utils/recursively-read-dir";
import { transformRequestToLambdaEvent } from "@saws/utils/transform-incoming-message-to-lambda-event";
import { watch } from "chokidar";
import esbuild from "esbuild";
import fs from "fs";
import getPort from "get-port";
import http, { IncomingMessage, ServerResponse } from "http";
import mime from "mime-types";
import path from "path";
import WebSocket from "ws";
import { getStackName, getTemplate } from "./cloud-formation.template";
import {
  getStackName as getS3CodeStackName,
  getTemplate as getS3CodeTemplate,
} from "./code-s3-cloud-formation.template";
import * as compiler from "@remix-run/dev/dist/compiler/compiler";
import { createFileWatchCache } from "@remix-run/dev/dist/compiler/fileWatchCache";
import { readConfig } from "@remix-run/dev/dist/config";
import { logger } from "@remix-run/dev/dist/tux/logger";
import { lambdaServer } from "@saws/lambda-server";
import { CloudFormation } from "@saws/aws/cloudformation";
import { Cloudfront } from "@saws/aws/cloudfront";
import { S3 } from "@saws/aws/s3";
import {
  ServiceDefinition,
  ServiceDefinitionConfig,
} from "@saws/core";
import fse from "fs-extra";
import { installMissingDependencies } from "@saws/utils/dependency-management";
import { createFileIfNotExists } from "@saws/utils/create-file-if-not-exists";
import { rootTemplate } from "./templates/root.template";
import { indexRouteTemplate } from "./templates/index-route.template";
import { indexTemplate } from "./templates/index.template";
import { remixConfig } from "./templates/remix-config.template";

interface RemixServiceConfig extends ServiceDefinitionConfig {
  rootDir?: string;
  port?: number;
  liveReloadPort?: number;
  include?: string[];
}

export class RemixService extends ServiceDefinition {
  rootDir: string;
  buildFilePath: string;
  handlerRef?: any;
  configPort?: number;
  port?: number;
  configLiveReloadPort?: number;
  liveReloadPort?: number;
  buildContext?: esbuild.BuildContext;
  entryPointPath: string;
  remixCompiler: any;
  include: string[];

  constructor(config: RemixServiceConfig) {
    super(config);
    this.rootDir = path.resolve(".", config.rootDir ?? this.name);
    this.buildFilePath = path.resolve(BUILD_DIR, this.name, "index.js");
    this.entryPointPath = path.resolve(this.rootDir, "index.ts");
    this.configPort = config.port;
    this.configLiveReloadPort = config.liveReloadPort ?? 8002;
    this.include = config.include ?? [];
  }

  async init() {
    try {
      const requiredDependencies = [
        "@remix-run/node",
        "@remix-run/react",
        "isbot",
        "react",
        "react-dom",
      ];
      await installMissingDependencies(requiredDependencies)

      const requiredDevDependencies = ["@remix-run/dev", "@types/react", "@types/react-dom"];
      await installMissingDependencies(requiredDevDependencies, { development: true })

      fs.mkdirSync(path.resolve(this.rootDir, "public"), { recursive: true });
      fs.mkdirSync(path.resolve(this.rootDir, "build"), { recursive: true });
      fs.mkdirSync(path.resolve(this.rootDir, "app", "routes"), {
        recursive: true,
      });

      createFileIfNotExists(
        path.resolve(this.rootDir, "app", "root.tsx"),
        rootTemplate({ name: this.name })
      );
      createFileIfNotExists(
        path.resolve(this.rootDir, "app", "routes", "_index.tsx"),
        indexRouteTemplate()
      );
      createFileIfNotExists(
        path.resolve(this.rootDir, "index.ts"),
        indexTemplate()
      );
      createFileIfNotExists(
        path.resolve(".", "remix.config.js"),
        remixConfig({ name: this.name })
      );
    } catch (err) {
      console.log(err);
    }
  }

  // the default remix build command has a few implications
  // 1. it does a process.exit(1) on any build failures
  // 2. it doesn't dispose of the compiler and thus it hangs
  // So we are building it ourselves based on how it works but without that stuff
  async buildRemix(mode: "development" | "production") {
    if (this.remixCompiler != null) {
      await this.remixCompiler?.cancel();
      await this.remixCompiler?.dispose();
      this.remixCompiler = null;
    }

    let config = await readConfig(path.resolve("."));
    const port = await this.getPort();
    let options = {
      mode,
      sourcemap: mode === "development",
      REMIX_DEV_ORIGIN:
        mode === "development"
          ? new URL(`http://localhost:${port}`)
          : undefined,
      external: mode === "production" ? ["@aws-sdk"] : [],
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
        treeShaking: true,
        entryPoints: [this.entryPointPath],
        bundle: true,
        outfile: this.buildFilePath,
        sourcemap: true,
        platform: "node",
        external: mode === "production" ? ["@aws-sdk"] : [],
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
      console.error("Remix build error", err);
      this.buildContext?.dispose();
      this.buildContext = undefined;
      this.remixCompiler?.dispose();
      this.remixCompiler = null;
    }
  }

  async registerFunction() {
    await lambdaServer.registerFunction({
      type: "javascript",
      name: this.name,
      path: this.buildFilePath,
      environment: await this.getDependenciesEnvironmentVariables("local"),
    });
  }

  async dev() {
    await super.dev();

    console.log("Building remix app", this.name);

    let wss = new WebSocket.Server({ port: await this.getLiveReloadPort() });
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
    await this.registerFunction();

    broadcast({ type: "RELOAD" });
    watch(this.rootDir, {
      ignoreInitial: true,
      ignored: [path.join(this.rootDir, "build")],
    }).on("all", async (...args) => {
      console.log(`Detected changes in ${this.name}. Rebuilding...`);
      await this.build();
      await this.registerFunction();
      broadcast({ type: "RELOAD" });
    });

    await this.startDevServer();
    await lambdaServer.start();
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
    console.log("Starting remix server", this.name);

    return new Promise(async (resolve) => {
      const port = await this.getPort();

      const server = http.createServer(
        async (req: IncomingMessage, res: ServerResponse) => {
          if (req.method === "GET" && req.url?.startsWith("/public")) {
            try {
              const file = fs.readFileSync(
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

            const resultString = await lambdaServer.invokeFunction(
              this.name,
              await transformRequestToLambdaEvent(req),
              context
            );

            const results = JSON.parse(resultString);

            const headers = {
              ...results.headers,
              ...results.multiValueHeaders,
            };

            if (results.cookies?.length > 0) {
              headers["set-cookie"] = results.cookies.join("; ");
            }

            res.writeHead(results.statusCode, headers);
            res.end(
              results.isBase64Encoded
                ? Buffer.from(results.body, "base64")
                : results.body
            );
          } catch (err) {
            console.log(err);
            res.writeHead(500);
            res.end();
          }
        }
      );

      server.listen(port, "0.0.0.0", () => {
        this.setOutputs(
          {
            remixEndpoint: `http://localhost:${port}`,
          },
          "local"
        );
        console.log(`${this.name} Endpoint:`, `http://localhost:${port}`);
        resolve(null);
      });
    });
  }

  async getPort() {
    if (this.port != null) return this.port;
    this.port = await getPort({ port: this.configPort });
    return this.port;
  }

  async getLiveReloadPort() {
    if (this.liveReloadPort != null) return this.liveReloadPort;
    this.liveReloadPort = await getPort({ port: this.configLiveReloadPort });
    return this.liveReloadPort;
  }

  async deploy(stage: string) {
    await super.deploy(stage);

    console.log(`Creating bucket to store ${this.name} code in`);
    // create s3 bucket
    const cloudformationClient = new CloudFormation();
    const s3Client = new S3();

    const bucketName = `${stage}-${this.name}-code`;

    const s3Template = getS3CodeTemplate({ bucketName, name: this.name });
    const s3StackName = getS3CodeStackName(stage, this.name);

    await cloudformationClient.deployStack(s3StackName, s3Template);

    console.log("Deploying function", this.name);

    await this.build("production");
    await this.remixCompiler?.dispose();
    this.buildContext?.dispose();

    // upload build to S3
    console.log("Uploading", this.name);
    const zipPath = await buildCodeZip(this.buildFilePath, {
      name: this.name,
      include: this.include,
      hasExternalModules: false,
      includePrisma: this.dependencies.some(dep => dep.constructor.name === 'PostgresService')
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

  async getEnvironmentVariables(_: string) {
    return {};
  }

  getStdOut() {
    return null;
  }

  getPermissions(_stage: string) {
    return [];
  }
}

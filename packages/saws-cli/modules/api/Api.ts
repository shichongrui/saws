import getPort from "get-port";
import {
  ApiConfig,
  ModuleType,
  ServiceType,
  BUILD_DIR,
  getProjectName,
} from "@shichongrui/saws-core";
import { CloudFormation, S3 } from "@shichongrui/saws-aws";
import { ChildProcess } from "child_process";
import { ModuleDefinition, Outputs } from "../ModuleDefinition";
import path from "path";
import esbuild from "esbuild";
import { watch } from "chokidar";
import jwt, { GetPublicKeyOrSecret } from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import http, { IncomingMessage, ServerResponse } from "http";
import { graphiqlTemplate } from "../../templates/graphiql.template";
import { collectHttpBody } from "../../utils/collect-http-body";
import {
  getStackName as getS3StackName,
  getTemplate as getS3Template,
} from "./s3-cloud-formation.template";
import { npmInstall } from "../../shell-commands/npm";
import { buildCodeZip } from "../../utils/build-code-zip";
import { getStackName, getTemplate } from "./cloud-formation.template";

export class Api implements ModuleDefinition, ApiConfig {
  type: ModuleType.API = ModuleType.API;
  displayName: string;
  port?: number;
  configPort?: number;
  rootDir: string;
  name: string;
  process?: ChildProcess;
  buildContext?: esbuild.BuildContext;
  handlerRef?: any;
  entryPointPath: string;
  buildFilePath: string;
  dependencies: ModuleDefinition[];
  outputs: Outputs = {};
  externalPackages: string[];

  constructor(
    name: string,
    config: ApiConfig,
    dependencies: ModuleDefinition[]
  ) {
    this.name = name;
    this.displayName = config.displayName ?? name;
    this.rootDir = path.resolve(".", config.rootDir ?? this.name);
    this.entryPointPath = path.resolve(this.rootDir, "index.ts");
    this.buildFilePath = path.resolve(BUILD_DIR, this.name, "index.js");
    this.dependencies = dependencies;
    this.configPort = config.port;
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
    console.log("Building api", this.displayName);
    await this.build();
    this.captureHandlerRef();
    watch(this.rootDir, { ignoreInitial: true }).on("all", async (...args) => {
      console.log(`Detected changes in ${this.displayName}. Rebuilding...`);
      await this.build();
      this.captureHandlerRef();
    });

    await this.startDevServer();
  }

  captureHandlerRef() {
    delete require.cache[require.resolve(this.buildFilePath)];
    this.handlerRef = require(this.buildFilePath).handler;
  }

  async startDevServer() {
    console.log("Starting api", this.displayName);
    const authDependency = this.dependencies.find(
      ({ type }) => type === ServiceType.AUTH
    );
    const { userPoolId, accessToken } = authDependency?.getOutputs() ?? {};

    for (const dependency of this.dependencies) {
      process.env = {
        ...process.env,
        ...(await dependency.getEnvironmentVariables()),
      };
    }

    const client = jwksClient({
      jwksUri: `http://localhost:9229/${userPoolId}/.well-known/jwks.json`,
    });
    const getJwksKey: GetPublicKeyOrSecret = (header, callback) => {
      client.getSigningKey(header.kid, (_, key) => {
        callback(null, key?.getPublicKey());
      });
    };

    return new Promise(async (resolve) => {
      const port = await this.getPort();

      const server = http.createServer(
        async (req: IncomingMessage, res: ServerResponse) => {
          if (req.method === "GET" && req.url === "/graphiql") {
            const html = graphiqlTemplate({
              graphqlServerUrl: `http://localhost:${this.port}`,
              accessToken: String(accessToken),
            });
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(html);
            return;
          }

          try {
            const authToken =
              req.headers.authorization?.replace("Bearer ", "") ?? "";
            if (authDependency != null) {
              await new Promise((resolve, reject) => {
                jwt.verify(authToken, getJwksKey, {}, (err, decoded) => {
                  if (err) return reject(err);
                  resolve(decoded);
                });
              });
            }

            const body = await collectHttpBody(req);

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
              {
                httpMethod: req.method,
                path: req.url,
                headers: {
                  ...req.headers,
                  Authorization: authToken,
                },
                requestContext: {},
                body,
              },
              context,
              () => {}
            );
            res.writeHead(results.statusCode, {
              ...results.headers,
              ...results.multiValueHeaders,
            });
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
          graphqlEndpoint: `http://localhost:${port}`,
          graphiqlEndpoint: `http://localhost:${port}/graphiql`,
        });
        console.log(
          `${this.name} GraphQL Endpoint:`,
          `http://localhost:${port}`
        );
        console.log(
          `${this.name} GraphiQL Endpoint:`,
          `http://localhost:${port}/graphiql`
        );
        resolve(null);
      });
    });
  }

  async deploy(stage: string) {
    console.log(`Creating bucket to store ${this.displayName} code in`);
    // create s3 bucket
    const cloudformationClient = new CloudFormation();
    const s3Client = new S3();

    const projectName = getProjectName();
    const bucketName = `${projectName}-${stage}-${this.name}`;

    const s3Template = getS3Template({ bucketName });
    const s3StackName = getS3StackName(stage, this.name);

    await cloudformationClient.deployStack(s3StackName, s3Template);

    console.log("Building", this.name);
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
    console.log("Uploading", this.displayName);
    const zipPath = await buildCodeZip(this.buildFilePath, {
      name: this.name,
      hasExternalModules: this.externalPackages.length > 0,
    });
    const key = path.parse(zipPath).base;
    const fileExists = await s3Client.doesFileExist(bucketName, key);
    if (!fileExists) {
      await s3Client.uploadFileFromPath(bucketName, key, zipPath);
    }

    console.log("Deploying", this.displayName);

    const authModule = this.dependencies.find(
      ({ type }) => type === ServiceType.AUTH
    );
    const { userPoolId, userPoolClientId } = authModule?.getOutputs() ?? {};

    let environment = {}
    for (const dependency of this.dependencies) {
      environment = {
        ...environment,
        ...(await dependency.getEnvironmentVariables())
      }
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
      userPoolId: userPoolId != null ? String(userPoolId) : undefined,
      userPoolClientId:
        userPoolClientId != null ? String(userPoolClientId) : undefined,
      permissions,
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

    return;
  }

  teardown() {
    return null;
  }

  getOutputs() {
    return this.outputs;
  }

  async getEnvironmentVariables() {
    return {
      API_URL: String(this.outputs.graphqlEndpoint),
    };
  }

  getStdOut() {
    return null;
  }

  setOutputs(outputs: Outputs) {
    this.outputs = {
      ...this.outputs,
      ...outputs,
    };
  }

  async getPort() {
    if (this.port != null) return this.port;
    this.port = await getPort({ port: this.configPort });
    return this.port;
  }

  getPermissions(_: ModuleType, __: string) {
    return [];
  }

  exit() {
    // no op
  }
}

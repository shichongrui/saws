import { lambdaServer } from "@saws/lambda-server";
import { CloudFormation } from "@saws/aws/cloudformation";
import { S3 } from "@saws/aws/s3";
import { CognitoService } from "@saws/cognito/cognito-service";
import {
  ServiceDefinition,
  ServiceDefinitionConfig,
} from "@saws/core";
import { BUILD_DIR } from "@saws/utils/constants";
import { buildCodeZip } from "@saws/utils/build-code-zip";
import { collectHttpBody } from "@saws/utils/collect-http-body";
import { npmInstallDependency } from "@saws/utils/dependency-management";
import { watch } from "chokidar";
import esbuild from "esbuild";
import fse from "fs-extra";
import getPort from "get-port";
import jwt, { GetPublicKeyOrSecret } from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import http, { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { getStackName, getTemplate } from "./cloud-formation.template";
import { graphiqlTemplate } from "./graphiql.template";
import {
  getStackName as getS3StackName,
  getTemplate as getS3Template,
} from "./s3-cloud-formation.template";

interface ApiServiceConfig extends ServiceDefinitionConfig {
  handler?: string;
  externalPackages?: string[];
  port?: number;
  include?: string[];
}

export class ApiService extends ServiceDefinition {
  rootDir: string;
  buildContext?: esbuild.BuildContext;
  entryPointPath: string;
  buildFilePath: string;
  externalPackages: string[];
  port?: number;
  configPort?: number;
  include: string[];

  constructor(config: ApiServiceConfig) {
    super(config);
    this.rootDir = path.resolve(".", config.handler ?? this.name);
    this.entryPointPath = path.resolve(this.rootDir, "index.ts");
    this.buildFilePath = path.resolve(BUILD_DIR, this.name, "index.js");
    this.configPort = config.port
    this.externalPackages = config.externalPackages ?? [];
    this.include = config.include ?? [];
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
      environment: await this.getDependenciesEnvironmentVariables("local"),
    });
  }

  async dev() {
    await super.dev();

    await this.build();
    await this.registerFunction();
    watch(this.rootDir, { ignoreInitial: true }).on("all", async (...args) => {
      console.log(`Detected changes in ${this.name}. Rebuilding...`);
      await this.build();
      await this.registerFunction();
    });

    await this.startDevServer();
    await lambdaServer.start();
  }

  async startDevServer() {
    const authDependency = this.dependencies.find(
      (serviceDefinition) => serviceDefinition instanceof CognitoService
    );
    const { userPoolId, accessToken } = authDependency?.getOutputs() ?? {};

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
              if (authToken.length === 0) {
                res.writeHead(401)
                res.end('Unauthorized');
                return
              }

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

            const resultString = await lambdaServer.invokeFunction(
              this.name,
              {
                httpMethod: req.method,
                path: req.url,
                headers: {
                  ...req.headers,
                  Authorization: authToken,
                },
                requestContext: {},
                // for remix apps we need the base64 encoded string
                body: Buffer.from(body || "", "base64").toString(),
              },
              context
            );
            const results = JSON.parse(resultString);
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

      server.listen(port, "0.0.0.0", async () => {
        await this.setOutputs(
          {
            apiEndpoint: `http://localhost:${port}`,
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

  async deploy(stage: string) {
    await super.deploy(stage);

    console.log(`Creating bucket to store ${this.name} code in`);
    // create s3 bucket
    const cloudformationClient = new CloudFormation();
    const s3Client = new S3();

    const bucketName = `${stage}-${this.name}`;

    const s3Template = getS3Template({ bucketName });
    const s3StackName = getS3StackName(stage, this.name);

    await cloudformationClient.deployStack(s3StackName, s3Template);

    console.log("Building", this.name);
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

    const authModule = this.dependencies.find(
      (service) => service instanceof CognitoService
    );
    const { userPoolId, userPoolClientId } = authModule?.getOutputs() ?? {};

    const environment = await this.getDependenciesEnvironmentVariables(stage);

    const permissions = this.dependencies
      .map((dependency) => dependency.getPermissions(process.env.STAGE!))
      .flat();

    const template = getTemplate({
      name: this.name,
      stage,
      moduleName: path.parse(this.buildFilePath).name,
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

    this.setOutputs(
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
    return {
      [this.parameterizedEnvVarName("API_URL")]: String(
        this.outputs.apiEndpoint
      ),
    };
  }
}

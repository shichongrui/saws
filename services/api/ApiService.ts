import { BUILD_DIR } from "../../utils/constants";
import {
  ServiceDefinition,
  ServiceDefinitionConfig,
} from "../ServiceDefinition";
import { collectHttpBody } from "../../utils/collect-http-body";
import getPort from "get-port";
import { watch } from "chokidar";
import esbuild from "esbuild";
import path from "node:path";
import { AuthService } from "../auth/AuthService";
import jwt, { GetPublicKeyOrSecret } from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import http, { IncomingMessage, ServerResponse } from "node:http";
import { graphiqlTemplate } from "./graphiql.template";
import { CloudFormation } from "../../helpers/aws/cloudformation";
import { S3 } from "../../helpers/aws/s3";
import { getProjectName } from "../../utils/get-project-name";
import {
  getTemplate as getS3Template,
  getStackName as getS3StackName,
} from "./s3-cloud-formation.template";
import { npmInstall } from "../../helpers/npm";
import { buildCodeZip } from "../../utils/build-code-zip";
import { getStackName, getTemplate } from "./cloud-formation.template";

interface ApiServiceConfig extends ServiceDefinitionConfig {
  handler?: string;
  externalPackages?: string[];
  port?: number;
}

export class ApiService extends ServiceDefinition {
  rootDir: string;
  buildContext?: esbuild.BuildContext;
  entryPointPath: string;
  buildFilePath: string;
  externalPackages: string[];
  handlerRef?: any;
  port?: number;
  configPort?: number;

  constructor(config: ApiServiceConfig) {
    super(config);
    this.rootDir = path.resolve(".", config.handler ?? this.name);
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
    await super.dev();

    await this.build();
    this.captureHandlerRef();
    watch(this.rootDir, { ignoreInitial: true }).on("all", async (...args) => {
      console.log(`Detected changes in ${this.name}. Rebuilding...`);
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
    const authDependency = this.dependencies.find(
      (serviceDefinition) => serviceDefinition instanceof AuthService
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

      server.listen(port, "0.0.0.0", async () => {
        await this.setOutputs(
          {
            apiEndpoint: `http://localhost:${port}`,
            graphiqlEndpoint: `http://localhost:${port}/graphiql`,
          },
          "local"
        );
        console.log(`${this.name} Endpoint:`, `http://localhost:${port}`);
        console.log(
          `${this.name} GraphiQL Endpoint:`,
          `http://localhost:${port}/graphiql`
        );
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

    const authModule = this.dependencies.find(
      (service) => service instanceof AuthService
    );
    const { userPoolId, userPoolClientId } = authModule?.getOutputs() ?? {};

    let environment = {};
    for (const dependency of this.dependencies) {
      environment = {
        ...environment,
        ...(await dependency.getEnvironmentVariables()),
      };
    }

    const permissions = this.dependencies
      .map((dependency) =>
        dependency.getPermissions(process.env.STAGE!)
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
    }, stage);

    return;
  }

  async getEnvironmentVariables() {
    return {
      [this.parameterizedEnvVarName("API_URL")]: String(
        this.outputs.apiEndpoint
      ),
    };
  }
}

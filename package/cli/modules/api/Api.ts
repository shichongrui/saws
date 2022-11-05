import getPort from "get-port";
import {
  ApiConfig,
  ModuleType,
  ServiceType,
} from "../../../config";
import { ChildProcess } from 'child_process';
import { ModuleDefinition, Outputs } from "../ModuleDefinition";
import path from "path";
import esbuild from 'esbuild';
import { BUILD_DIR } from "../../../utils/constants";
import { watch } from 'chokidar'
import jwt, { GetPublicKeyOrSecret } from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import http from 'http';
import { graphiqlTemplate } from "../../templates/graphiql.template";
import collectHttpBody from "../../../utils/collect-http-body";
import { CloudFormation } from "../../../aws/cloudformation";
import { getProjectName } from "../../../utils/get-project-name";
import { getStackName as getS3StackName, getTemplate as getS3Template } from "./s3-cloud-formation.template";
import { npmInstall } from "../../cli-commands/npm";
import { buildCodeZip } from "../../../utils/build-code-zip";
import { S3 } from "../../../aws/s3";
import { getStackName, getTemplate } from "./cloud-formation.template";

export class Api implements ModuleDefinition, ApiConfig {
  type: ModuleType.API = ModuleType.API;
  displayName: string;
  port?: number;
  rootDir: string;
  name: string;
  process?: ChildProcess
  buildResults?: esbuild.BuildResult
  handlerRef?: any
  entryPointPath: string
  buildFilePath: string
  dependencies: ModuleDefinition[]
  outputs: Outputs = {}

  constructor(name: string, config: ApiConfig, dependencies: ModuleDefinition[]) {
    this.name = name;
    this.displayName = config.displayName ?? name;
    this.rootDir = path.resolve('.', config.rootDir ?? this.name)
    this.entryPointPath = path.resolve(this.rootDir, "index.ts")
    this.buildFilePath = path.resolve(BUILD_DIR, `${this.name}.js`);
    this.dependencies = dependencies;
  }

  async build(incremental: boolean = true) {
    try {
      if (this.buildResults != null) {
        await this.buildResults.rebuild?.();
        return;
      }

      this.buildResults = await esbuild.build({
        entryPoints: [this.entryPointPath],
        bundle: true,
        outfile: this.buildFilePath,
        sourcemap: true,
        platform: "node",
        incremental: incremental,
        // TODO: this is hard coded for now until we have some kind of config method
        external: ['jsdom'],
      });
    } catch (err) {
      console.error(err)
    }
  }

  async dev() {
    console.log('Building api', this.displayName)
    await this.build()
    this.captureHandlerRef()
    watch(this.rootDir, { ignoreInitial: true }).on('all', async (...args) => {
      console.log(`Detected changes in ${this.displayName}. Rebuilding...`)
      await this.build()
      this.captureHandlerRef()
    })

    await this.startDevServer()
  }

  captureHandlerRef() {
    delete require.cache[require.resolve(this.buildFilePath)];
    this.handlerRef = require(this.buildFilePath).handler
  }

  async startDevServer() {
    console.log('Starting api', this.displayName)
    const authDependency = this.dependencies.find(({ type }) => type === ServiceType.AUTH);
    const { userPoolId, accessToken } = authDependency?.getOutputs() ?? {}

    this.dependencies.forEach((dependency) => {
      process.env = {
        ...process.env,
        ...dependency.getEnvironmentVariables(),
      }
    })

    const client = jwksClient({
      jwksUri: `http://localhost:9229/${userPoolId}/.well-known/jwks.json`,
    });
    const getJwksKey: GetPublicKeyOrSecret = (header, callback) => {
      client.getSigningKey(header.kid, (_, key) => {
        callback(null, key?.getPublicKey());
      });
    };
  
    return new Promise((resolve) => {
      const server = http.createServer(async (req, res) => {
        if (req.method === "GET" && req.url === "/graphiql") {
          const html = graphiqlTemplate({
            graphqlServerUrl: "http://localhost:8000",
            accessToken: String(accessToken),
          });
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(html);
          return;
        }
  
        try {
          const authToken =
            req.headers.authorization?.replace("Bearer ", "") ?? "";

          await new Promise((resolve, reject) => {
            jwt.verify(authToken, getJwksKey, {}, (err, decoded) => {
              if (err) return reject(err);
              resolve(decoded);
            });
          });
  
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
                "content-type": "application/json",
                Authorization: authToken,
              },
              requestContext: {},
              body,
            },
            context,
            () => {}
          );
  
          const responseBody = JSON.parse(results.body);
          if ("errors" in responseBody) {
            console.error(
              responseBody.errors
                .map((e: any) => e.extensions.exception.stacktrace.join('\n'))
                .join("\n")
            );
          }
  
          res.writeHead(results.statusCode, results.multiValueHeaders);
          res.end(results.body);
        } catch (err) {
          console.log("Error:", err);
        }
      });
  
      server.listen(8000, "0.0.0.0", () => {
        this.setOutputs({
          graphqlEndpoint: 'http://localhost:8000',
          graphiqlEndpoint: 'http://localhost:8000/graphiql'
        })
        console.log("GraphQL Endpoint:", "http://localhost:8000");
        console.log("GraphiQL Endpoint:", "http://localhost:8000/graphiql");
        resolve(null);
      });
    });
  }

  async deploy(stage: string) {
    console.log(`Creating bucket to store ${this.displayName} code in`)
    // create s3 bucket
    const cloudformationClient = new CloudFormation()
    const s3Client = new S3()

    const projectName = getProjectName()
    const bucketName = `${projectName}-${stage}-saws`;

    const s3Template = getS3Template({ bucketName })
    const s3StackName = getS3StackName(stage, this.name)

    await cloudformationClient.deployStack(s3StackName, s3Template)

    console.log('Building', this.name);
    await this.build(false)

    // for external node modules, we need to re-install them so that we get
    // them and all their dependencies
    await npmInstall('jsdom', path.resolve(BUILD_DIR));

    // upload build to S3
    console.log("Uploading", this.displayName);
    const zipPath = await buildCodeZip(this.buildFilePath, projectName);
    const key = path.parse(zipPath).base;
    const fileExists = await s3Client.doesFileExist(bucketName, key);
    if (!fileExists) {
      await s3Client.uploadFile(bucketName, key, zipPath);
    }

    console.log('Deploying', this.displayName)

    const dbModule = this.dependencies.find(({ type }) => type === ServiceType.POSTGRES);
    const {
      postgresHost,
      postgresPort,
      postgresUsername,
      postgresDBName
    } = dbModule?.getOutputs() ?? {}

    const authModule = this.dependencies.find(({ type }) => type === ServiceType.AUTH);
    const {
      userPoolId,
      userPoolClientId
    } = authModule?.getOutputs() ?? {}

    const functionModules = this.dependencies.filter(({ type }) => type === ModuleType.FUNCTION);

    const template = getTemplate({
      name: this.name,
      stage,
      moduleName: path.parse(this.buildFilePath).name,
      projectName: getProjectName(),
      codeBucketName: bucketName,
      codeS3Key: key,
      dbName: String(postgresDBName),
      dbPort: String(postgresPort),
      dbHost: String(postgresHost),
      dbUsername: String(postgresUsername),
      userPoolId: String(userPoolId),
      userPoolClientId: String(userPoolClientId),
      lambdaPermissions: functionModules.map(m => m.getPermissionsTemplate?.(stage) ?? ''),
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

  getEnvironmentVariables() {
    return {}
  }

  getStdOut() {
    return null
  }

  setOutputs(outputs: Outputs) {
    this.outputs = {
      ...this.outputs,
      ...outputs,
    };
  }

  async getPort() {
    this.port = await getPort({ port: this.port });
    return this.port;
  }

  exit() {
    // no op
  }
}

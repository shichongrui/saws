import { ModuleDefinition, Outputs } from "../ModuleDefinition";
import { ModuleType, RemixConfig } from "../../../config";
import path from "path";
import { exec } from "child_process";
import { BUILD_DIR } from "../../../utils/constants";
import { watch } from "chokidar";
import getPort from "get-port";
import http, { IncomingMessage, ServerResponse } from "http";
import mime from "mime-types";
import { promises as fs } from "fs";
import collectHttpBody from "../../../utils/collect-http-body";
import esbuild from "esbuild";
import { transformRequestToLambdaEvent } from "../../utils/transform-incoming-message-to-lambda-event";
import { copyDirectory } from "../../utils/copy-directory";

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

  async build(mode: "development" | "production" = "development") {
    await new Promise((resolve, reject) => {
      exec(
        "npx remix build",
        {
          cwd: path.resolve(this.rootDir, ".."),
        },
        (err) => {
          if (err != null) return reject(err);
          resolve(null);
        }
      );
    });
    await copyDirectory(
      path.join(this.rootDir, "public"),
      path.resolve(BUILD_DIR, this.name, "public")
    );
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
        external: ["./build"],
      });
      await this.buildContext.rebuild();
    } catch (err) {
      console.error(err);
    }
  }

  async dev() {
    console.log("Building remix app", this.displayName);
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

    for (const dependency of this.dependencies) {
      process.env = {
        ...process.env,
        ...(await dependency.getEnvironmentVariables()),
      };
    }

    return new Promise(async (resolve) => {
      const port = await this.getPort();

      const server = http.createServer(
        async (req: IncomingMessage, res: ServerResponse) => {
          if (req.method === "GET") {
            try {
              const file = await fs.readFile(
                path.join(BUILD_DIR, this.name, "public", req.url!)
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
              if (["ENOENT", "EISDIR"].includes((err as any).code) === false) {
                res.writeHead(500, { "Content-Type": "text/plain" });
                res.end("500 Internal Server Error");
                return;
              }
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
            }

            if (results.cookies?.length > 0) {
              headers['set-cookie'] = results.cookies.join('; ')
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

  async deploy(stage: string) {}

  setOutputs(outputs: Outputs) {}

  getOutputs() {
    return {};
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

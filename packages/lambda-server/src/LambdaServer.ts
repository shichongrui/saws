import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
  type Server,
} from "node:http";
import { fork, type ChildProcess, spawn } from "child_process";
import { collectHttpBody } from "@saws/utils/collect-http-body";
import * as path from "node:path";
import { JavascriptFunctionMessage } from "./javascript-function-message-types";
import { randomUUID } from "node:crypto";

type ContainerFunctionDefinition = {
  type: "container";
  name: string;
  containerPort: number;
  environment: Record<string, string>;
};

type JavascriptFunctionDefinition = {
  type: "javascript";
  name: string;
  path: string;
  environment: Record<string, string>;
};

type FunctionDefinition =
  | ContainerFunctionDefinition
  | JavascriptFunctionDefinition;

export class LambdaServer {
  server?: Server;
  started: boolean = false;
  functions: Record<
    string,
    { definition: FunctionDefinition; process: ChildProcess }
  > = {};

  handler = async (req: IncomingMessage, res: ServerResponse) => {
    const fullFunctionName =
      req.url
        ?.replace("/2015-03-31/functions/", "")
        .replace("/invocations", "") ?? "";
    const functionName = fullFunctionName.split("local-")[1];
    if (req.method !== "POST" || this.functions[functionName] == null) {
      res.writeHead(404);
      res.end();
      return;
    }

    const invocationType = req.headers["x-amz-invocation-type"];
    if (invocationType === "Event") {
      res.writeHead(200, undefined);
      res.end();
    }

    const requestBody = await collectHttpBody(req);

    try {
      const results = await this.invokeFunction(
        functionName,
        JSON.parse(requestBody ?? ''),
        {}
      );
      if (invocationType !== "Event") {
        res.writeHead(200, undefined);
        res.end(results);
      }
    } catch (err) {
      console.log(err);
      if (invocationType !== "Event") {
        res.writeHead(500, undefined);
        res.end(JSON.stringify(err));
      }
    }
  };

  async invokeFunction(name: string, event: any, context: any) {
    const func = this.functions[name];
    if (func == null) throw new Error("No function");

    const { definition, process } = func;

    if (definition.type === "container") {
      const response = await fetch(
        `http://localhost:${definition.containerPort}/2015-03-31/functions/function/invocations`,
        {
          method: "POST",
          body: JSON.stringify(event),
        }
      );
      const responseText = await response.text();
      return responseText;
    } else if (definition.type === "javascript") {
      let id = randomUUID()
      let listener = function (resolve: any, reject: any, message: JavascriptFunctionMessage) {
        if (message.type === "response" && message.id === id) {
          resolve(JSON.stringify(message.response));
        } else if (message.type === "error" && message.id === id) {
          reject(new Error(message.error));
        }
      }
      const promise = new Promise<string>((resolve, reject) => {
        process.on("message", (listener as any).bind(null, resolve, reject));
      });

      process.send({
        type: "invoke",
        event,
        context,
        id,
      });

      let response = await promise

      process.removeListener('message', listener)

      return response;
    }

    throw new Error("Unsupported function type");
  }

  start() {
    if (this.started) return;
    console.log("Starting Lambda server...");
    this.server = createServer((req, res) => this.handler(req, res));
    this.started = true;
    return new Promise((resolve) => {
      this.server?.listen(9000, () => {
        console.log("Lambda server started");
        resolve(null);
      });
    });
  }

  close() {
    for (const func of Object.values(this.functions)) {
      func.process.kill(9);
    }

    if (!this.started) return;
    console.log("Closing lambda server...");
    this.server?.close();
    this.started = false;
  }

  private registerContainerFunction(definition: ContainerFunctionDefinition) {
    const existingProcess = this.functions[definition.name];
    existingProcess?.process.kill(9);

    const newProcess = spawn("docker", [
      "run",
      "--rm",
      "--name",
      definition.name,
      "-p",
      `${definition.containerPort}:8080`,
      definition.name,
    ]);

    newProcess.stdout.pipe(process.stdout);
    newProcess.stderr.pipe(process.stderr);

    this.functions[definition.name] = {
      definition,
      process: newProcess,
    };
    return newProcess;
  }

  private async registerJavascriptFunction(
    definition: JavascriptFunctionDefinition
  ) {
    const newProcess = fork(path.resolve(__dirname, "lambda-entrypoint.js"), {
      env: {
        NODE_ENV: 'development',
        STAGE: 'local',
        ...definition.environment
      },
      cwd: path.resolve("."),
    });

    newProcess.send({
      type: "load-function",
      path: definition.path,
    });

    const promise = await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error(`Issue registering ${definition.name}`)),
        5000
      );
      newProcess.once("message", (message: JavascriptFunctionMessage) => {
        if (message.type === "ready") {
          clearTimeout(timeout);
          resolve(null);
        } else if (message.type === "load-failed") {
          clearTimeout(timeout);
          reject(
            new Error(message.error ?? `Failed to load ${definition.name}`)
          );
        }
      });
    });

    await promise;

    const existingProcess = this.functions[definition.name];
    existingProcess?.process.kill(9);

    this.functions[definition.name] = {
      definition,
      process: newProcess,
    };
    return newProcess;
  }

  registerFunction(definition: FunctionDefinition) {
    switch (definition.type) {
      case "container":
        return this.registerContainerFunction(definition);
      case "javascript":
        return this.registerJavascriptFunction(definition);
    }
  }
}

export const lambdaServer = new LambdaServer();

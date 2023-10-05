import http from "http";
import { FunctionRuntime } from "@shichongrui/saws-core";
import { collectHttpBody } from "./utils/collect-http-body";
import type { ContainerFunction } from "./modules/function/container/ContainerFunction";
import type { TypescriptFunction } from "./modules/function/typescript/TypescriptFunction";
import { Function } from "./modules/function/Function";

export class LambdaServer {
  server?: http.Server;
  started: boolean = false;
  functions: Function[] = [];

  handler = async (req: http.IncomingMessage, res: http.ServerResponse) => {
    const fullFunctionName =
    req.url
    ?.replace("/2015-03-31/functions/", "")
    .replace("/invocations", "") ?? "";
    const functionName = fullFunctionName.split("-local-")[1];
    
    const func = this.functions.find(({ name }) => functionName === name)

    if (req.method !== "POST" || func == null) {
      res.writeHead(404);
      res.end();
      return;
    }

    const requestBody = await collectHttpBody(req);
    if (func.runtime === FunctionRuntime.CONTAINER) {
      const port = await (func as ContainerFunction).getPort()
      const response = await fetch(
        `http://localhost:${port}/2015-03-31/functions/function/invocations`,
        {
          method: "POST",
          body: requestBody,
        }
      );
      const responseText = await response.text();
      res.writeHead(response.status, undefined);
      res.end(responseText);
    } else if (func.runtime === FunctionRuntime.TYPESCRIPT) {
      const handler = (func as TypescriptFunction).handlerRef
      try {
        const results = await handler(requestBody, {})
        res.writeHead(200, undefined)
        res.end(JSON.stringify(results) ?? '')
      } catch (err) {
        console.log(err)
        res.writeHead(500, undefined)
        res.end(JSON.stringify(err))
      }
    }
  };

  start() {
    if (this.started) return;
    console.log('Starting Lambda server...')
    this.server = http.createServer((req, res) => this.handler(req, res));
    this.started = true;
    return new Promise((resolve) => {
      this.server?.listen(9000, () => {
        resolve(null);
      });
    });
  }

  registerFunction(func: Function) {
    this.functions.push(func);
  }
}

export const lambdaServer = new LambdaServer()

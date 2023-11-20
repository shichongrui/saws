// TODO: Fix this after function is done

import http from "http";
import { collectHttpBody } from "./collect-http-body";
import { FunctionService } from "../services/function/FunctionService";
import { ContainerFunctionService } from "../services/function/container/ContainerFunctionService";
import { TypescriptFunctionService } from "../services/function/typescript/TypescriptFunctionService";

export class LambdaServer {
  server?: http.Server;
  started: boolean = false;
  functions: FunctionService[] = [];

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
    // TODO: once the function service is build, change this
    if (func instanceof ContainerFunctionService) {
      const port = await func.getPort()
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
      // TODO: once the function service is build, change this
    } else if (func instanceof TypescriptFunctionService) {
      const handler = func.handlerRef
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

  registerFunction(func: FunctionService) {
    this.functions.push(func);
  }
}

export const lambdaServer = new LambdaServer()

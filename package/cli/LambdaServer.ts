import http from "http";
import fetch from "node-fetch";
import { FunctionConfig, FunctionRuntime } from "../config";
import collectHttpBody from "../utils/collect-http-body";
import { Function } from "./modules/function/Function";

export class LambdaServer {
  server: http.Server;
  started: boolean = false;
  functions: Function[] = [];

  constructor() {
    this.server = http.createServer(this.handler);
  }

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
    }
  };

  start() {
    if (this.started) return;
    console.log('Starting Lambda server...')
    this.started = true;
    return new Promise((resolve) => {
      this.server.listen(9000, "0.0.0.0", () => {
        resolve(null);
      });
    });
  }

  registerFunction(func: Function) {
    this.functions.push(func);
  }
}

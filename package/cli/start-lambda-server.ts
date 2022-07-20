import http from "http";
import fetch from "node-fetch";
import { FunctionConfig, FunctionRuntime } from "../config";
import collectHttpBody from "../utils/collect-http-body";

const startLambdaServer = async (configs: FunctionConfig[]) => {
  const server = http.createServer(async (req, res) => {
    const fullFunctionName =
      req.url
        ?.replace("/2015-03-31/functions/", "")
        .replace("/invocations", "") ?? "";
    const functionName = fullFunctionName.split("-local-")[1];

    const config = configs.find(({ name }) => name === functionName);

    if (req.method !== "POST" || config == null) {
      res.writeHead(404);
      res.end();
      return;
    }

    const requestBody = await collectHttpBody(req);

    if (config.runtime === FunctionRuntime.CONTAINER) {
      const response = await fetch(
        `http://localhost:${config.port}/2015-03-31/functions/function/invocations`,
        {
          method: "POST",
          body: requestBody,
        }
      );
      const responseText = await response.text();
      res.writeHead(response.status, undefined);
      res.end(responseText);
    }
  });

  await new Promise((resolve) => {
    server.listen(9000, "0.0.0.0", () => {
      console.log("Started fake lambda");
      resolve(null);
    });
  });
};

export default startLambdaServer;

import http from "http";
import { graphiqlTemplate } from "../resources/graphiql.template";
import { Handler } from 'aws-lambda';

const collectBody = async (req: http.IncomingMessage): Promise<string> => {
  return new Promise((resolve) => {
    if (req.method !== "POST") {
      resolve("");
      return;
    }
    let body = "";
    req.on("data", function (chunk) {
      body += chunk;
    });

    req.on("end", function () {
      resolve(body);
    });
  });
};

export type HandlerRef = {
  current?: Handler<any, any>;
};

export const startDevServer = (handlerRef: HandlerRef) => {
  return new Promise((resolve) => {
    process.env.DATABASE_URL = 'postgresql://postgres:password@localhost:5432/postgres'
    try {
      const server = http.createServer(async (req, res) => {
        if (req.method === "GET" && req.url === "/graphiql") {
          const html = graphiqlTemplate({
            graphqlServerUrl: 'http://localhost:8000',
          });
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(html);
          return;
        }

        const body = await collectBody(req);

        const context = {
          callbackWaitsForEmptyEventLoop: true,
          functionName: 'saws-api',
          functionVersion: '1',
          invokedFunctionArn: 'aws:local:function',
          memoryLimitInMB: '128',
          awsRequestId: '1234',
          logGroupName: 'asdf',
          logStreamName: 'asdf',
          getRemainingTimeInMillis: () => 1234,
          done: () => {},
          fail: () => {},
          succeed: () => {},
        }
        const results = await handlerRef.current?.({
          httpMethod: req.method,
          path: req.url,
          headers: {
            "content-type": "application/json",
          },
          requestContext: {},
          body,
        }, context, () => {});
        res.writeHead(results.statusCode, results.multiValueHeaders);
        res.end(results.body);
      });

      server.listen(8000, "0.0.0.0", () => {
        console.log("Started");
        resolve(null);
      });
    } catch (err) {
      console.log(err);
      throw err;
    }
  });
};

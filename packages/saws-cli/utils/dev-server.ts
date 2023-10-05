import http from "http";
import { Handler } from "aws-lambda";
import jwksClient from "jwks-rsa";
import jwt, { GetPublicKeyOrSecret } from "jsonwebtoken";
import { graphiqlTemplate } from "../templates/graphiql.template";
import { collectHttpBody } from "./collect-http-body";

const setDBEnvironment = () => {
  process.env = {
    ...process.env,
    DATABASE_USERNAME: "postgres",
    DATABASE_HOST: "localhost",
    DATABASE_PORT: "5432",
    DATABASE_NAME: "postgres",
  };
};

export type HandlerRef = {
  current?: Handler<any, any>;
};

export const startDevServer = async (
  handlerRef: HandlerRef,
  userPoolId: string,
  accessToken: string
) => {
  const client = jwksClient({
    jwksUri: `http://localhost:9229/${userPoolId}/.well-known/jwks.json`,
  });
  const getJwksKey: GetPublicKeyOrSecret = (header, callback) => {
    client.getSigningKey(header.kid, (_, key) => {
      callback(null, key?.getPublicKey());
    });
  };

  return new Promise((resolve) => {
    setDBEnvironment();
    const server = http.createServer(async (req, res) => {
      if (req.method === "GET" && req.url === "/graphiql") {
        const html = graphiqlTemplate({
          graphqlServerUrl: "http://localhost:8000",
          accessToken,
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
        const results = await handlerRef.current?.(
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
      console.log("Started");
      resolve(null);
    });
  });
};

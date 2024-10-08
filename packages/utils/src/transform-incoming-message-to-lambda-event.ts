import type { IncomingMessage } from "node:http";
import { collectHttpBody } from "./collect-http-body";

export const transformRequestToLambdaEvent = async (req: IncomingMessage) => {
  const body = await collectHttpBody(req);
  const url = new URL(req.url ?? "", "http://localhost");
  const search = url.searchParams;

  const { cookie, ...headers } = req.headers;

  return {
    httpMethod: req.method,
    rawPath: url.pathname,
    path: req.url,
    headers,
    cookies: cookie?.split(/; ?/g),
    requestContext: {
      http: {
        method: req.method,
      },
    },
    body,
    rawQueryString: url.search.replace('?', ''),
    queryStringParameters: [...search.entries()].reduce(
      (acc, [key, value]) => ({ ...acc, [key]: value }),
      {}
    ), // You'd need to parse req.url for query parameters
    isBase64Encoded: true,
  };
};

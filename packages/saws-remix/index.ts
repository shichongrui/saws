/// <reference lib="dom" />

import type { AppLoadContext, ServerBuild } from "@remix-run/node";
import {
  createRequestHandler as createRemixRequestHandler,
  readableStreamToString,
} from "@remix-run/node";
import type {
  APIGatewayProxyEventHeaders,
  APIGatewayProxyEventV2,
  APIGatewayProxyHandlerV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";

import { isBinaryType } from "./binary-types";

/**
 * A function that returns the value to use as `context` in route `loader` and
 * `action` functions.
 *
 * You can think of this as an escape hatch that allows you to pass
 * environment/platform-specific values through to your loader/action.
 */
export type GetLoadContextFunction = (
  event: APIGatewayProxyEventV2
) => Promise<AppLoadContext> | AppLoadContext;

export class RemixApp {
  createLambdaHandler = (
    {
      getLoadContext,
      build,
    }: {
      getLoadContext?: GetLoadContextFunction;
      build: ServerBuild;
    }
  ): APIGatewayProxyHandlerV2 => {
    const mode = process.env.STAGE === "local" ? "development" : "production";
    let handleRequest = createRemixRequestHandler(build, mode);

    return async (event) => {
      try {
        let request = this.createRemixRequest(event);
        let loadContext = await getLoadContext?.(event);

        let response = await handleRequest(request, loadContext);

        return this.sendRemixResponse(response);
      } catch (err) {
        console.log(err);
        throw err;
      }
    };
  };

  createRemixRequest(event: APIGatewayProxyEventV2): Request {
    let host = event.headers["x-forwarded-host"] || event.headers.host;
    let search = event.rawQueryString.length ? `?${event.rawQueryString}` : "";
    let url = new URL(`http://${host}${event.rawPath}${search}`);
    let isFormData = event.headers["content-type"]?.includes(
      "multipart/form-data"
    );
    // Note: No current way to abort these for Architect, but our router expects
    // requests to contain a signal so it can detect aborted requests
    let controller = new AbortController();

    return new Request(url.href, {
      method: event.requestContext.http.method,
      headers: this.createRemixHeaders(event.headers, event.cookies),
      // Cast until reason/throwIfAborted added
      // https://github.com/mysticatea/abort-controller/issues/36
      signal: controller.signal,
      body:
        event.body && event.isBase64Encoded
          ? isFormData
            ? Buffer.from(event.body, "base64")
            : Buffer.from(event.body, "base64").toString()
          : event.body,
    });
  }

  createRemixHeaders(
    requestHeaders: APIGatewayProxyEventHeaders,
    requestCookies?: string[]
  ): Headers {
    let headers = new Headers();

    for (let [header, value] of Object.entries(requestHeaders)) {
      if (value) {
        headers.append(header, value);
      }
    }

    if (requestCookies) {
      headers.append("Cookie", requestCookies.join("; "));
    }

    return headers;
  }

  async sendRemixResponse(
    nodeResponse: Response
  ): Promise<APIGatewayProxyStructuredResultV2> {
    let cookies: string[] = [];

    // Arc/AWS API Gateway will send back set-cookies outside of response headers.
    // @ts-expect-error
    for (let [key, value] of nodeResponse.headers.entries()) {
      if (key.toLowerCase() === "set-cookie") {
        cookies.push(value);
      }
    }

    if (cookies.length) {
      nodeResponse.headers.delete("Set-Cookie");
    }

    let contentType = nodeResponse.headers.get("Content-Type");
    let isBase64Encoded = isBinaryType(contentType);
    let body: string | undefined;

    if (nodeResponse.body) {
      if (isBase64Encoded) {
        body = await readableStreamToString(nodeResponse.body, "base64");
      } else {
        body = await nodeResponse.text();
      }
    }

    return {
      statusCode: nodeResponse.status,
      // @ts-expect-error
      headers: Object.fromEntries(nodeResponse.headers.entries()),
      cookies,
      body,
      isBase64Encoded,
    };
  }
}

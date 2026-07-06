"use strict";
/// <reference lib="dom" />
Object.defineProperty(exports, "__esModule", { value: true });
exports.RemixApp = void 0;
const node_1 = require("@remix-run/node");
const binary_types_1 = require("@saws/utils/binary-types");
class RemixApp {
    createLambdaHandler = ({ getLoadContext, build, }) => {
        const mode = process.env.STAGE === "local" ? "development" : "production";
        let handleRequest = (0, node_1.createRequestHandler)(build, mode);
        return async (event) => {
            try {
                let request = this.createRemixRequest(event);
                let loadContext = await getLoadContext?.(event);
                let response = await handleRequest(request, loadContext);
                return this.sendRemixResponse(response);
            }
            catch (err) {
                console.log(err);
                throw err;
            }
        };
    };
    createRemixRequest(event) {
        let host = event.headers["x-forwarded-host"] || event.headers.host;
        let search = event.rawQueryString.length ? `?${event.rawQueryString}` : "";
        let url = new URL(`http://${host}${event.rawPath}${search}`);
        let isFormData = event.headers["content-type"]?.includes("multipart/form-data");
        // Note: No current way to abort these for Architect, but our router expects
        // requests to contain a signal so it can detect aborted requests
        let controller = new AbortController();
        return new Request(url.href, {
            method: event.requestContext.http.method,
            headers: this.createRemixHeaders(event.headers, event.cookies),
            // Cast until reason/throwIfAborted added
            // https://github.com/mysticatea/abort-controller/issues/36
            signal: controller.signal,
            body: event.body && event.isBase64Encoded
                ? isFormData
                    ? Buffer.from(event.body, "base64")
                    : Buffer.from(event.body, "base64").toString()
                : event.body,
        });
    }
    createRemixHeaders(requestHeaders, requestCookies) {
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
    async sendRemixResponse(nodeResponse) {
        let cookies = [];
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
        let isBase64Encoded = (0, binary_types_1.isBinaryType)(contentType);
        let body;
        if (nodeResponse.body) {
            if (isBase64Encoded) {
                body = await (0, node_1.readableStreamToString)(nodeResponse.body, "base64");
            }
            else {
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
exports.RemixApp = RemixApp;

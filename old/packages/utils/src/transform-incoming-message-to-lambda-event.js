"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.transformRequestToLambdaEvent = void 0;
const collect_http_body_1 = require("./collect-http-body");
const transformRequestToLambdaEvent = async (req) => {
    const body = await (0, collect_http_body_1.collectHttpBody)(req);
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
        queryStringParameters: [...search.entries()].reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {}), // You'd need to parse req.url for query parameters
        isBase64Encoded: true,
    };
};
exports.transformRequestToLambdaEvent = transformRequestToLambdaEvent;

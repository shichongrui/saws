import http from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";

let apiKeys;
try {
  apiKeys = JSON.parse(process.env.GATEWAY_API_KEYS ?? "[]");
} catch {
  throw new Error("GATEWAY_API_KEYS must be a JSON array of bearer tokens");
}
if (
  !Array.isArray(apiKeys) ||
  apiKeys.length === 0 ||
  apiKeys.some((key) => typeof key !== "string" || !/^[A-Za-z0-9._~+/-]+=*$/.test(key))
) {
  throw new Error(
    "GATEWAY_API_KEYS must contain at least one nonempty bearer token without whitespace",
  );
}
const expectedKeys = [...new Set(apiKeys)].map(digest);
const upstream = new URL(process.env.LANGUAGETOOL_URL);
if (upstream.protocol !== "http:") throw new Error("LanguageTool upstream must use HTTP");

function digest(value) {
  return createHash("sha256").update(value).digest();
}

function proxyHeaders(headers) {
  const result = { ...headers };
  const hopHeaders = [
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
    ...(headers.connection ?? "").split(",").map((name) => name.trim().toLowerCase()),
  ];
  for (const name of hopHeaders) delete result[name];
  return result;
}

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/__saws/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end('{"ok":true}');
    return;
  }

  const token = /^Bearer ([A-Za-z0-9._~+/-]+=*)$/i.exec(req.headers.authorization ?? "")?.[1];
  const tokenDigest = digest(token ?? "");
  // Compare every key so matching an earlier entry does not short-circuit authentication.
  let matched = 0;
  for (const expectedKey of expectedKeys) {
    matched |= Number(timingSafeEqual(tokenDigest, expectedKey));
  }
  if (!token || !matched) {
    res.writeHead(401, { "www-authenticate": "Bearer", connection: "close" });
    res.end("Unauthorized");
    return;
  }
  if (!req.url.startsWith("/v2/")) {
    res.writeHead(404, { connection: "close" });
    res.end("Not found");
    return;
  }

  const headers = proxyHeaders(req.headers);
  delete headers.authorization;
  headers.host = upstream.host;
  const pending = http.request(
    {
      hostname: upstream.hostname,
      port: upstream.port,
      method: req.method,
      path: req.url,
      headers,
    },
    (response) => {
      res.writeHead(response.statusCode ?? 502, proxyHeaders(response.headers));
      response.on("error", () => res.destroy());
      response.pipe(res);
    },
  );
  pending.setTimeout(120_000, () => pending.destroy());
  pending.on("error", () => {
    if (res.headersSent) res.destroy();
    else {
      res.writeHead(502);
      res.end("LanguageTool unavailable");
    }
  });
  req.on("error", () => pending.destroy());
  res.on("close", () => pending.destroy());
  req.pipe(pending);
});
server.headersTimeout = 15_000;
server.requestTimeout = 120_000;
server.listen(Number(process.env.GATEWAY_PORT ?? 8081), "0.0.0.0");
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    server.close();
    server.closeAllConnections();
  });
}

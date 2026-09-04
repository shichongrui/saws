import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { spawn as spawnPty } from "node-pty";
import { WebSocketServer } from "ws";

const directory = path.dirname(fileURLToPath(import.meta.url));
const publicPort = parsePort(process.env.GATEWAY_PORT || "7456");
const internalOrigin = new URL(process.env.GATEWAY_INTERNAL_ORIGIN || "http://127.0.0.1:17456");
const setupPassword = requiredEnvironment("GATEWAY_SETUP_PASSWORD");
const requirement = parseRequirement(process.env.GATEWAY_AUTH_REQUIREMENT || "any");
const workspace = process.env.GATEWAY_WORKSPACE || "/workspace";
const openDesignDataDirectory = process.env.OD_DATA_DIR || "/app/.od";
const openDesignAppConfigPath = path.join(openDesignDataDirectory, "app-config.json");
const sessionDirectory = path.join(process.env.HOME || "/agent-home", ".saws-open-design");
const sessionKey = await loadOrCreateSessionKey();
const passwordSalt = randomBytes(32);
const passwordHash = scryptSync(setupPassword, passwordSalt, 64);
const sessionLifetimeMs = 12 * 60 * 60 * 1000;
const csrfLifetimeMs = 60 * 60 * 1000;
const loginWindowMs = 15 * 60 * 1000;
const loginLimit = 5;
const attempts = new Map();
const claudeLogins = new Map();
let codexLogin;
let authCache;
let shuttingDown = false;
let openDesignProcess;
let openDesignRunning = false;
let openDesignRestartTimer;
let openDesignConfigWrites = Promise.resolve();

await preparePersistentDirectories();
startOpenDesign();

const terminalServer = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
terminalServer.on("connection", (socket, _request, login) => attachClaudeTerminal(socket, login));

const server = http.createServer(async (request, response) => {
  try {
    addSecurityHeaders(response);
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

    if (url.pathname === "/__saws/health") {
      const auth = await getAuthenticationStatus();
      return json(response, 200, {
        gateway: true,
        openDesign: openDesignRunning,
        codex: auth.codex,
        claude: auth.claude,
      });
    }
    if (url.pathname === "/__saws/csrf" && request.method === "GET") {
      const token = createCsrfToken();
      setCookie(response, "saws_od_csrf", token, request, csrfLifetimeMs, false);
      return json(response, 200, { token });
    }
    if (url.pathname.startsWith("/__saws/assets/") && request.method === "GET") {
      return serveAsset(url.pathname, response);
    }
    if (url.pathname === "/__saws/session" && request.method === "POST") {
      enforceCsrf(request);
      return await login(request, response);
    }

    const session = readSession(request);
    if (url.pathname === "/__saws/status" && request.method === "GET") {
      if (!session) return json(response, 200, { session: false });
      const auth = await getAuthenticationStatus(true);
      const selectedAgent = await getSelectedOpenDesignAgent();
      return json(response, 200, {
        session: true,
        requirement,
        ...auth,
        selectedAgent,
        satisfied: isAccessReady(auth, selectedAgent),
      });
    }
    if (!session) {
      if (url.pathname.startsWith("/__saws/"))
        return json(response, 401, { error: "Sign in required" });
      return serveIndex(response);
    }

    if (url.pathname === "/__saws/login/codex") {
      if (request.method === "POST") {
        enforceCsrf(request);
        return json(response, 202, await startCodexLogin());
      }
      if (request.method === "GET") return json(response, 200, publicCodexLogin());
    }
    if (url.pathname === "/__saws/login/claude" && request.method === "POST") {
      enforceCsrf(request);
      return json(response, 202, startClaudeLogin());
    }
    if (url.pathname === "/__saws/agent" && request.method === "POST") {
      enforceCsrf(request);
      const body = await readJson(request, 8192);
      const agent = parseAgent(body?.agent);
      const auth = await getAuthenticationStatus(true);
      if (!auth[agent]) throw httpError(409, `${agentDisplayName(agent)} is not connected`);
      await selectOpenDesignAgent(agent);
      return json(response, 200, { selectedAgent: agent });
    }
    if (url.pathname.startsWith("/__saws/")) return json(response, 404, { error: "Not found" });

    const auth = await getAuthenticationStatus();
    const selectedAgent = await getSelectedOpenDesignAgent();
    if (!isAccessReady(auth, selectedAgent)) return serveIndex(response);
    return proxyHttp(request, response);
  } catch (error) {
    const status = error.statusCode || 500;
    if (status >= 500) console.error("Gateway request failed:", safeError(error));
    json(response, status, { error: status >= 500 ? "Gateway request failed" : error.message });
  }
});

server.on("upgrade", async (request, socket, head) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    if (!readSession(request)) throw httpError(401, "Sign in required");

    if (url.pathname === "/__saws/terminal") {
      const login = claudeLogins.get(url.searchParams.get("id"));
      if (!login || login.expiresAt < Date.now()) throw httpError(404, "Login session not found");
      return terminalServer.handleUpgrade(request, socket, head, (webSocket) => {
        terminalServer.emit("connection", webSocket, request, login);
      });
    }

    const auth = await getAuthenticationStatus();
    const selectedAgent = await getSelectedOpenDesignAgent();
    if (!isAccessReady(auth, selectedAgent))
      throw httpError(403, "Agent authentication and selection required");
    proxyUpgrade(request, socket, head);
  } catch (error) {
    socket.end(`HTTP/1.1 ${error.statusCode || 500} Unauthorized\r\nConnection: close\r\n\r\n`);
  }
});

server.listen(publicPort, "0.0.0.0", () => {
  console.log(`SAWS OpenDesign gateway listening on port ${publicPort}`);
});

function startOpenDesign() {
  if (shuttingDown) return;
  openDesignProcess = spawn("node", ["apps/daemon/dist/cli.js", "--no-open"], {
    cwd: "/app",
    env: process.env,
    stdio: ["ignore", "inherit", "inherit"],
  });
  openDesignRunning = true;
  openDesignProcess.once("exit", (code, signal) => {
    openDesignRunning = false;
    if (shuttingDown) return;
    console.error(`OpenDesign exited (${signal || code}); restarting in 2 seconds`);
    openDesignRestartTimer = setTimeout(startOpenDesign, 2000);
  });
  openDesignProcess.once("error", (error) => {
    openDesignRunning = false;
    console.error("Unable to start OpenDesign:", safeError(error));
  });
}

async function login(request, response) {
  const key = request.socket.remoteAddress || "unknown";
  const record = attempts.get(key) || { count: 0, resetAt: Date.now() + loginWindowMs };
  if (record.resetAt <= Date.now())
    Object.assign(record, { count: 0, resetAt: Date.now() + loginWindowMs });
  if (record.count >= loginLimit) throw httpError(429, "Too many attempts; try again later");
  const body = await readJson(request, 8192);
  const candidate = typeof body.password === "string" ? body.password : "";
  const candidateHash = scryptSync(candidate, passwordSalt, 64);
  if (!timingSafeEqual(passwordHash, candidateHash)) {
    record.count += 1;
    attempts.set(key, record);
    throw httpError(401, "Invalid application password");
  }
  attempts.delete(key);
  const token = signValue(JSON.stringify({ exp: Date.now() + sessionLifetimeMs }));
  setCookie(response, "saws_od_session", token, request, sessionLifetimeMs, true);
  json(response, 200, { ok: true });
}

function readSession(request) {
  const token = parseCookies(request.headers.cookie).saws_od_session;
  if (!token) return false;
  const value = verifyValue(token);
  if (!value) return false;
  try {
    const session = JSON.parse(value);
    return Number.isFinite(session.exp) && session.exp > Date.now();
  } catch {
    return false;
  }
}

function createCsrfToken() {
  return signValue(
    JSON.stringify({
      nonce: randomBytes(18).toString("base64url"),
      exp: Date.now() + csrfLifetimeMs,
    }),
  );
}

function enforceCsrf(request) {
  const header = request.headers["x-csrf-token"];
  const cookie = parseCookies(request.headers.cookie).saws_od_csrf;
  if (typeof header !== "string" || !cookie || header !== cookie)
    throw httpError(403, "Invalid CSRF token");
  const value = verifyValue(header);
  if (!value) throw httpError(403, "Invalid CSRF token");
  try {
    if (JSON.parse(value).exp <= Date.now()) throw new Error("expired");
  } catch {
    throw httpError(403, "Expired CSRF token");
  }
}

async function getAuthenticationStatus(force = false) {
  if (!force && authCache && authCache.expiresAt > Date.now()) return authCache.value;
  const [codex, claude] = await Promise.all([
    commandSucceeds("codex", ["login", "status"]),
    commandSucceeds("claude", ["auth", "status"]),
  ]);
  const value = { codex, claude };
  authCache = { value, expiresAt: Date.now() + 10_000 };
  return value;
}

function isSatisfied(auth) {
  if (requirement === "codex") return auth.codex;
  if (requirement === "claude") return auth.claude;
  if (requirement === "all") return auth.codex && auth.claude;
  return auth.codex || auth.claude;
}

function isAccessReady(auth, selectedAgent) {
  return isSatisfied(auth) && selectedAgent != null && auth[selectedAgent];
}

function commandSucceeds(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: workspace, env: process.env, stdio: "ignore" });
    const timer = setTimeout(() => child.kill("SIGKILL"), 7000);
    child.once("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
  });
}

async function startCodexLogin() {
  if (codexLogin && ["starting", "waiting", "configuring"].includes(codexLogin.state))
    return publicCodexLogin();
  const child = spawn("codex", ["app-server", "--stdio"], {
    cwd: workspace,
    env: process.env,
    stdio: ["pipe", "pipe", "ignore"],
  });
  codexLogin = { state: "starting", child, buffer: "", expiresAt: Date.now() + 15 * 60 * 1000 };
  const timeout = setTimeout(
    () => finishCodexLogin(false, "Codex device login timed out"),
    15 * 60 * 1000,
  );
  codexLogin.timeout = timeout;
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (data) => parseCodexMessages(data));
  child.once("error", () => finishCodexLogin(false, "Unable to start Codex login"));
  child.once("exit", (code) => {
    if (["starting", "waiting"].includes(codexLogin?.state))
      finishCodexLogin(false, `Codex login exited (${code})`);
  });
  sendCodex({
    id: 1,
    method: "initialize",
    params: {
      clientInfo: { name: "saws-open-design-gateway", version: "1.0.0" },
      capabilities: { experimentalApi: true },
    },
  });
  return publicCodexLogin();
}

function parseCodexMessages(data) {
  if (!codexLogin) return;
  codexLogin.buffer += data;
  let newline;
  while ((newline = codexLogin.buffer.indexOf("\n")) >= 0) {
    const line = codexLogin.buffer.slice(0, newline).trim();
    codexLogin.buffer = codexLogin.buffer.slice(newline + 1);
    if (!line) continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      continue;
    }
    if (message.id === 1 && message.result) {
      sendCodex({ method: "initialized" });
      sendCodex({ id: 2, method: "account/login/start", params: { type: "chatgptDeviceCode" } });
    } else if (message.id === 2 && message.result?.type === "chatgptDeviceCode") {
      Object.assign(codexLogin, {
        state: "waiting",
        loginId: message.result.loginId,
        verificationUrl: message.result.verificationUrl,
        userCode: message.result.userCode,
      });
    } else if (message.method === "account/login/completed") {
      finishCodexLogin(
        Boolean(message.params?.success),
        message.params?.error || "Codex login failed",
      );
    } else if (message.id === 2 && message.error) {
      finishCodexLogin(
        false,
        "Codex device login is unavailable. Enable it in ChatGPT security or workspace settings.",
      );
    }
  }
}

function sendCodex(message) {
  codexLogin?.child.stdin.write(`${JSON.stringify(message)}\n`);
}

function finishCodexLogin(success, error) {
  if (!codexLogin || !["starting", "waiting"].includes(codexLogin.state)) return;
  const login = codexLogin;
  clearTimeout(login.timeout);
  login.child.kill("SIGTERM");
  authCache = undefined;
  if (!success) {
    login.state = "error";
    login.error = String(error).slice(0, 240);
    return;
  }
  login.state = "configuring";
  selectOpenDesignAgent("codex").then(
    () => {
      login.state = "complete";
    },
    (configurationError) => {
      login.state = "error";
      login.error = `Codex connected, but OpenDesign setup failed: ${safeError(configurationError)}`;
    },
  );
}

function publicCodexLogin() {
  if (!codexLogin) return { state: "idle" };
  return {
    state: codexLogin.state,
    verificationUrl: codexLogin.verificationUrl,
    userCode: codexLogin.userCode,
    error: codexLogin.error,
  };
}

function startClaudeLogin() {
  for (const login of claudeLogins.values()) {
    if (!login.exited && login.expiresAt > Date.now())
      throw httpError(409, "A Claude login is already active");
  }
  const id = randomBytes(18).toString("base64url");
  const terminal = spawnPty("claude", ["auth", "login"], {
    name: "xterm-256color",
    cols: 100,
    rows: 30,
    cwd: workspace,
    env: { ...process.env, TERM: "xterm-256color" },
  });
  const login = {
    id,
    terminal,
    sockets: new Set(),
    history: "",
    exited: false,
    expiresAt: Date.now() + 15 * 60 * 1000,
  };
  claudeLogins.set(id, login);
  login.timer = setTimeout(() => terminal.kill(), 15 * 60 * 1000);
  terminal.onData((data) => {
    const safe = redactTerminalOutput(data);
    login.history = `${login.history}${safe}`.slice(-64 * 1024);
    for (const socket of login.sockets) sendSocket(socket, { type: "data", data: safe });
  });
  terminal.onExit(async ({ exitCode }) => {
    clearTimeout(login.timer);
    login.exited = true;
    authCache = undefined;
    const authenticated = await commandSucceeds("claude", ["auth", "status"]);
    let error;
    if (authenticated) {
      try {
        await selectOpenDesignAgent("claude");
      } catch (configurationError) {
        error = `Claude Code connected, but OpenDesign setup failed: ${safeError(configurationError)}`;
      }
    }
    for (const socket of login.sockets)
      sendSocket(socket, { type: "exit", exitCode, authenticated, error });
    setTimeout(() => claudeLogins.delete(id), 60_000);
  });
  return { id };
}

function attachClaudeTerminal(socket, login) {
  login.sockets.add(socket);
  if (login.history) sendSocket(socket, { type: "data", data: login.history });
  if (login.exited) sendSocket(socket, { type: "exit" });
  socket.on("message", (raw) => {
    try {
      const message = JSON.parse(raw.toString());
      if (
        message.type === "input" &&
        typeof message.data === "string" &&
        message.data.length <= 4096
      )
        login.terminal.write(message.data);
      if (message.type === "resize")
        login.terminal.resize(clamp(message.cols, 40, 240), clamp(message.rows, 10, 80));
      if (message.type === "cancel") login.terminal.kill();
    } catch {}
  });
  socket.on("close", () => login.sockets.delete(socket));
}

function proxyHttp(request, response) {
  const headers = proxyHeaders(request.headers);
  const upstream = http.request(
    {
      hostname: internalOrigin.hostname,
      port: internalOrigin.port,
      method: request.method,
      path: request.url,
      headers,
    },
    (upstreamResponse) => {
      // The gateway CSP protects gateway-owned pages, but OpenDesign relies on inline
      // bootstrap scripts and srcdoc previews. Preserve an upstream policy when one
      // exists instead of imposing the gateway policy on proxied content.
      response.removeHeader("content-security-policy");
      response.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
      upstreamResponse.pipe(response);
    },
  );
  upstream.on("error", () => json(response, 502, { error: "OpenDesign is unavailable" }));
  request.pipe(upstream);
}

function proxyUpgrade(request, socket, head) {
  const upstream = net.connect(Number(internalOrigin.port), internalOrigin.hostname, () => {
    const headers = proxyHeaders(request.headers);
    upstream.write(`${request.method} ${request.url} HTTP/${request.httpVersion}\r\n`);
    for (const [key, value] of Object.entries(headers)) {
      if (value != null)
        upstream.write(`${key}: ${Array.isArray(value) ? value.join(", ") : value}\r\n`);
    }
    upstream.write("\r\n");
    if (head.length) upstream.write(head);
    socket.pipe(upstream).pipe(socket);
  });
  upstream.on("error", () => socket.destroy());
}

function proxyHeaders(headers) {
  const result = { ...headers };
  delete result.cookie;
  delete result["x-csrf-token"];
  result.host = internalOrigin.host;
  result["x-forwarded-host"] = headers.host || "";
  return result;
}

function serveAsset(requestPath, response) {
  const assets = {
    "/__saws/assets/app.js": [path.join(directory, "app.js"), "text/javascript; charset=utf-8"],
    "/__saws/assets/style.css": [path.join(directory, "style.css"), "text/css; charset=utf-8"],
    "/__saws/assets/xterm.js": [
      path.join(directory, "node_modules/@xterm/xterm/lib/xterm.js"),
      "text/javascript; charset=utf-8",
    ],
    "/__saws/assets/xterm.css": [
      path.join(directory, "node_modules/@xterm/xterm/css/xterm.css"),
      "text/css; charset=utf-8",
    ],
    "/__saws/assets/addon-fit.js": [
      path.join(directory, "node_modules/@xterm/addon-fit/lib/addon-fit.js"),
      "text/javascript; charset=utf-8",
    ],
  };
  const asset = assets[requestPath];
  if (!asset) return json(response, 404, { error: "Not found" });
  response.writeHead(200, { "content-type": asset[1], "cache-control": "public, max-age=86400" });
  createReadStream(asset[0]).pipe(response);
}

function serveIndex(response) {
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  createReadStream(path.join(directory, "index.html")).pipe(response);
}

function addSecurityHeaders(response) {
  response.setHeader(
    "content-security-policy",
    "default-src 'self'; connect-src 'self' ws: wss:; style-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  );
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("x-frame-options", "DENY");
  response.setHeader("referrer-policy", "no-referrer");
  response.setHeader("permissions-policy", "camera=(), microphone=(), geolocation=()");
}

function setCookie(response, name, value, request, lifetime, httpOnly) {
  const forwardedProto = String(request.headers["x-forwarded-proto"] || "")
    .split(",", 1)[0]
    .trim();
  const secure = request.socket.encrypted || forwardedProto === "https";
  response.setHeader(
    "set-cookie",
    `${name}=${value}; Path=/; Max-Age=${Math.floor(lifetime / 1000)}; SameSite=Strict${httpOnly ? "; HttpOnly" : ""}${secure ? "; Secure" : ""}`,
  );
}

function signValue(value) {
  const encoded = Buffer.from(value).toString("base64url");
  const signature = createHmac("sha256", sessionKey).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function verifyValue(token) {
  const separator = token.lastIndexOf(".");
  if (separator < 1) return undefined;
  const encoded = token.slice(0, separator);
  const supplied = Buffer.from(token.slice(separator + 1), "base64url");
  const expected = createHmac("sha256", sessionKey).update(encoded).digest();
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return undefined;
  return Buffer.from(encoded, "base64url").toString("utf8");
}

async function loadOrCreateSessionKey() {
  await mkdir(sessionDirectory, { recursive: true, mode: 0o700 });
  const keyPath = path.join(sessionDirectory, "session-key");
  try {
    return await readFile(keyPath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const key = randomBytes(32);
  const handle = await open(keyPath, "wx", 0o600);
  try {
    await handle.writeFile(key);
  } finally {
    await handle.close();
  }
  return key;
}

async function preparePersistentDirectories() {
  await Promise.all([
    mkdir(process.env.CODEX_HOME || path.join(process.env.HOME || "/agent-home", ".codex"), {
      recursive: true,
      mode: 0o700,
    }),
    mkdir(path.join(process.env.HOME || "/agent-home", ".claude"), {
      recursive: true,
      mode: 0o700,
    }),
    mkdir(openDesignDataDirectory, { recursive: true, mode: 0o700 }),
    mkdir(workspace, { recursive: true, mode: 0o700 }),
  ]);
}

async function getSelectedOpenDesignAgent() {
  await openDesignConfigWrites;
  const config = await readOpenDesignAppConfig();
  return config.onboardingCompleted === true && ["codex", "claude"].includes(config.agentId)
    ? config.agentId
    : null;
}

function selectOpenDesignAgent(agent) {
  const write = openDesignConfigWrites.then(async () => {
    const config = await readOpenDesignAppConfig();
    const next = { ...config, onboardingCompleted: true, agentId: agent };
    const temporaryPath = `${openDesignAppConfigPath}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
    try {
      await writeFile(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
      });
      await rename(temporaryPath, openDesignAppConfigPath);
    } catch (error) {
      await unlink(temporaryPath).catch(() => {});
      throw error;
    }
  });
  openDesignConfigWrites = write.catch(() => {});
  return write;
}

async function readOpenDesignAppConfig() {
  let contents;
  try {
    contents = await readFile(openDesignAppConfigPath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
  const config = JSON.parse(contents);
  if (config == null || typeof config !== "object" || Array.isArray(config)) {
    throw new Error("OpenDesign app config must contain an object");
  }
  return config;
}

function parseCookies(header = "") {
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim().split("=", 2))
      .filter(([key, value]) => key && value),
  );
}

function readJson(request, limit) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > limit) reject(httpError(413, "Request is too large"));
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(httpError(400, "Invalid JSON"));
      }
    });
    request.on("error", reject);
  });
}

function json(response, status, value) {
  if (response.writableEnded) return;
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(value));
}

function redactTerminalOutput(value) {
  return value
    .replace(/\b(sk-ant-|sk-proj-|sk-)[A-Za-z0-9_-]{16,}\b/g, "$1[redacted]")
    .replace(/\bBearer\s+[A-Za-z0-9._~-]{20,}\b/gi, "Bearer [redacted]");
}

function sendSocket(socket, value) {
  if (socket.readyState === 1) socket.send(JSON.stringify(value));
}

function clamp(value, minimum, maximum) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.max(minimum, Math.min(maximum, Math.floor(number)))
    : minimum;
}

function parsePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid gateway port");
  return port;
}

function parseRequirement(value) {
  if (!["any", "codex", "claude", "all"].includes(value))
    throw new Error("Invalid authentication requirement");
  return value;
}

function parseAgent(value) {
  if (!["codex", "claude"].includes(value)) throw httpError(400, "Invalid agent selection");
  return value;
}

function agentDisplayName(agent) {
  return agent === "codex" ? "Codex" : "Claude Code";
}

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

function safeError(error) {
  return error instanceof Error ? error.message : "unknown error";
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  clearTimeout(openDesignRestartTimer);
  server.close();
  codexLogin?.child.kill("SIGTERM");
  for (const login of claudeLogins.values()) login.terminal.kill();
  if (openDesignProcess && !openDesignProcess.killed) openDesignProcess.kill(signal);
  const timer = setTimeout(() => process.exit(0), 8000);
  timer.unref();
  if (!openDesignProcess) process.exit(0);
  openDesignProcess.once("exit", () => process.exit(0));
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

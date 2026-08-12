import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { HonoAdapter } from "@bull-board/hono";
import { serve, type ServerType } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Queue } from "bullmq";
import { Hono } from "hono";

const DEFAULT_PORT = 3000;

export type BullMQDashboard = {
  app: Hono;
  server: ServerType;
  queues: Queue[];
  close(): Promise<void>;
};

export function startBullMQDashboard(): BullMQDashboard {
  const redisUrl = process.env["REDIS_URL"];
  if (redisUrl == null || redisUrl.length === 0) {
    throw new Error("REDIS_URL is required");
  }

  const queueNames = getQueueNamesFromEnvironment();
  if (queueNames.some((name) => name.trim().length === 0)) {
    throw new Error("BullMQ queue names cannot be empty");
  }
  const queues = [...new Set(queueNames)].map(
    (name) => new Queue(name, { connection: { url: redisUrl } }),
  );
  const serverAdapter = new HonoAdapter(serveStatic);
  serverAdapter.setBasePath("/");

  createBullBoard({
    queues: queues.map((queue) => new BullMQAdapter(queue)),
    serverAdapter,
  });

  const app = new Hono();
  app.route("/", serverAdapter.registerPlugin());

  const port = Number(process.env["PORT"] ?? DEFAULT_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("BullMQ dashboard port must be an integer from 1 to 65535");
  }
  const server = serve({ fetch: app.fetch, port }, (info) =>
    console.log(`BullMQ dashboard listening on http://localhost:${info.port}`),
  );

  return {
    app,
    server,
    queues,
    async close() {
      await Promise.all([closeServer(server), ...queues.map((queue) => queue.close())]);
    },
  };
}

function getQueueNamesFromEnvironment() {
  const value = JSON.parse(process.env["QUEUE_NAMES"] ?? "[]") as unknown;
  if (!Array.isArray(value) || !value.every((name) => typeof name === "string")) {
    throw new Error("QUEUE_NAMES must be a JSON array of strings");
  }
  return value;
}

function closeServer(server: ServerType) {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => (error == null ? resolve() : reject(error)));
  });
}

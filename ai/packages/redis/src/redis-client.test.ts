import assert from "node:assert/strict";
import test from "node:test";
import { Redis as IORedis } from "ioredis";
import {
  Redis,
  redisServiceUrlEnvironmentVariable,
  resolveRedisServiceUrl,
} from "./redis-client.js";

test("derives the Redis URL variable used by a Redis service", () => {
  assert.equal(
    redisServiceUrlEnvironmentVariable("session-cache"),
    "SESSION_CACHE_REDIS_URL"
  );
});

test("resolves a service URL from an application environment", () => {
  assert.equal(
    resolveRedisServiceUrl("session-cache", {
      SESSION_CACHE_REDIS_URL:
        "redis://:secret@localhost:6379",
    }),
    "redis://:secret@localhost:6379"
  );
});

test("creates a configured IORedis client", () => {
  const redis = new Redis("session-cache", {
    environment: {
      SESSION_CACHE_REDIS_URL:
        "redis://:secret@localhost:6379",
    },
    maxRetriesPerRequest: 3,
  });

  assert.ok(redis instanceof IORedis);
  assert.equal(redis.options.host, "localhost");
  assert.equal(redis.options.port, 6379);
  assert.equal(redis.options.password, "secret");
  assert.equal(redis.options.maxRetriesPerRequest, 3);

  redis.disconnect();
});

test("reports the expected variable when configuration is missing", () => {
  assert.throws(
    () => resolveRedisServiceUrl("missing-redis", {}),
    /MISSING_REDIS_REDIS_URL/
  );
});

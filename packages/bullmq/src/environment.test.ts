import assert from "node:assert/strict";
import test from "node:test";
import {
  bullmqServiceQueueNameEnvironmentVariable,
  bullmqServiceRedisUrlEnvironmentVariable,
  resolveBullMQConnection,
  resolveBullMQQueueName,
  resolveBullMQRedisUrl,
  serializeEnvironment,
} from "./environment.js";

test("derives the env vars used by a BullMQ service dependency", () => {
  assert.equal(
    bullmqServiceRedisUrlEnvironmentVariable("email-worker"),
    "EMAIL_WORKER_REDIS_URL",
  );
  assert.equal(
    bullmqServiceQueueNameEnvironmentVariable("email-worker"),
    "EMAIL_WORKER_QUEUE_NAME",
  );
});

test("resolves queue name and redis connection from an application environment", () => {
  assert.equal(
    resolveBullMQQueueName("email-worker", {
      EMAIL_WORKER_QUEUE_NAME: "production-emails",
    }),
    "production-emails",
  );
  assert.deepEqual(
    resolveBullMQConnection("email-worker", {
      EMAIL_WORKER_REDIS_URL: "redis://:secret@localhost:6379",
    }),
    { url: "redis://:secret@localhost:6379" },
  );
});

test("serializeEnvironment renders Docker env-file contents", () => {
  assert.equal(
    serializeEnvironment({ REDIS_URL: "redis://x", QUEUE_NAME_PREFIX: "prod" }),
    "REDIS_URL=redis://x\nQUEUE_NAME_PREFIX=prod\n",
  );
  assert.equal(serializeEnvironment(), undefined);
  assert.equal(serializeEnvironment({}), undefined);
});

test("rejects invalid env var names and newlines", () => {
  assert.throws(
    () => serializeEnvironment({ "bad-name": "x" }),
    /Invalid Docker environment variable name/,
  );
  assert.throws(
    () => serializeEnvironment({ REDIS_URL: "a\nb" }),
    /contains a newline/,
  );
});

test("reports the expected variable when configuration is missing", () => {
  assert.throws(() => resolveBullMQRedisUrl("missing", {}), /MISSING_REDIS_URL/);
  assert.throws(
    () => resolveBullMQQueueName("missing", {}),
    /MISSING_QUEUE_NAME/,
  );
});

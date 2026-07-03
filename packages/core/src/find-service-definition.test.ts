import assert from "node:assert/strict";
import test from "node:test";
import { findServiceDefinition } from "./find-service-definition.js";
import { ServiceDefinition } from "./service-definition.js";

test("finds a nested service by its configured name", () => {
  const database = new ServiceDefinition({ name: "db" });
  const api = new ServiceDefinition({
    name: "api",
    dependencies: [database],
  });
  const root = new ServiceDefinition({
    name: "app",
    dependencies: [api],
  });

  assert.equal(findServiceDefinition(root, "db"), database);
});

test("allows one shared service instance to appear in multiple branches", () => {
  const database = new ServiceDefinition({ name: "db" });
  const root = new ServiceDefinition({
    name: "app",
    dependencies: [
      new ServiceDefinition({ name: "api", dependencies: [database] }),
      new ServiceDefinition({ name: "worker", dependencies: [database] }),
    ],
  });

  assert.equal(findServiceDefinition(root, "db"), database);
});

test("reports available services when the requested service is missing", () => {
  const root = new ServiceDefinition({
    name: "app",
    dependencies: [new ServiceDefinition({ name: "db" })],
  });

  assert.throws(
    () => findServiceDefinition(root, "missing"),
    /Available services: app, db/
  );
});

test("rejects duplicate names assigned to different service instances", () => {
  const root = new ServiceDefinition({
    name: "app",
    dependencies: [
      new ServiceDefinition({ name: "worker" }),
      new ServiceDefinition({ name: "worker" }),
    ],
  });

  assert.throws(
    () => findServiceDefinition(root, "worker"),
    /Service name "worker" is ambiguous/
  );
});

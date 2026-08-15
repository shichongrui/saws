import assert from "node:assert/strict";
import { test } from "node:test";
import { DockerService } from "../dist/index.js";

class RuntimeFileDockerService extends DockerService {
  runtimeFiles = [];

  constructor() {
    super({ name: "runtime-files", image: "example/image:latest", host: null });
  }

  async getContainerRuntimeFiles() {
    return this.runtimeFiles;
  }

  async containerHash() {
    return this.getContainerConfigHash(await this.getDockerRunConfig("production", true));
  }
}

test("unchanged runtime file contents produce the same container hash", async () => {
  const service = new RuntimeFileDockerService();
  service.runtimeFiles = [
    { path: "/config/second.yaml", contents: "second: unchanged\n" },
    { path: "/config/first.yaml", contents: "first: unchanged\n" },
  ];
  const firstHash = await service.containerHash();

  service.runtimeFiles.reverse();

  assert.equal(await service.containerHash(), firstHash);
});

test("changed runtime file contents produce a different container hash", async () => {
  const service = new RuntimeFileDockerService();
  service.runtimeFiles = [{ path: "/config/service.yaml", contents: "value: before\n" }];
  const beforeHash = await service.containerHash();

  service.runtimeFiles = [{ path: "/config/service.yaml", contents: "value: after\n" }];

  assert.notEqual(await service.containerHash(), beforeHash);
});

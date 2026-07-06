import assert from "node:assert/strict";
import test from "node:test";
import { DevContext } from "@saws/core";
import { DockerProvider } from "@saws/docker";
import { Host } from "@saws/host";
import { RedisDockerService } from "./redis-docker-service.js";
class TestRedisDockerService extends RedisDockerService {
    getRunConfig(context) {
        return this.getDockerRunConfig(context);
    }
}
function createProvider() {
    return new DockerProvider({
        host: new Host({ name: "test", address: "example.test" }),
    });
}
test("reports the published host port while container connections use port 6379", async () => {
    const service = new RedisDockerService({
        name: "cache",
        docker: createProvider(),
        port: 16379,
        password: "secret",
    });
    const context = new DevContext({ stage: "development" });
    assert.deepEqual(await service.getEnvironmentVariables(context), {
        CACHE_REDIS_HOST: "localhost",
        CACHE_REDIS_PORT: "16379",
        CACHE_REDIS_PASSWORD: "secret",
        CACHE_REDIS_URL: "redis://:secret@localhost:16379",
    });
    assert.deepEqual(await service.getEnvironmentVariables(context, "container"), {
        CACHE_REDIS_HOST: "development-cache",
        CACHE_REDIS_PORT: "6379",
        CACHE_REDIS_PASSWORD: "secret",
        CACHE_REDIS_URL: "redis://:secret@development-cache:6379",
    });
    assert.deepEqual(await service.getOutputs(context), {
        redisHost: "localhost",
        redisPort: "16379",
        redisPassword: "secret",
        redisUrl: "redis://:secret@localhost:16379",
    });
});
test("defines a redis-cli ping health check that can be overridden", async () => {
    const service = new TestRedisDockerService({
        name: "cache",
        docker: createProvider(),
        password: "secret",
    });
    const disabled = new TestRedisDockerService({
        name: "disabled-cache",
        docker: createProvider(),
        password: "secret",
        healthCheck: false,
    });
    assert.deepEqual((await service.getRunConfig(new DevContext({ stage: "dev" })))
        .healthCheck, {
        command: 'redis-cli -a "$REDIS_PASSWORD" ping',
        interval: "10s",
        timeout: "5s",
        retries: 5,
        startPeriod: "10s",
    });
    assert.equal((await disabled.getRunConfig(new DevContext({ stage: "dev" })))
        .healthCheck, false);
});
test("derives environment prefix from the service name", () => {
    const service = new RedisDockerService({
        name: "my-redis",
        docker: createProvider(),
        password: "secret",
    });
    assert.equal(service.envPrefix, "MY_REDIS");
});
test("runs redis-server with requirepass and persistence", async () => {
    const service = new TestRedisDockerService({
        name: "cache",
        docker: createProvider(),
        password: "secret",
    });
    const config = await service.getRunConfig(new DevContext({ stage: "dev" }));
    assert.deepEqual(config.command, [
        "redis-server",
        "--requirepass",
        "secret",
        "--save",
        "60",
        "1",
        "--loglevel",
        "warning",
    ]);
});

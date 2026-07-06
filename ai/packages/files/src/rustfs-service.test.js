import assert from "node:assert/strict";
import test from "node:test";
import { DevContext } from "@saws/core";
import { DockerProvider } from "@saws/docker";
import { Host } from "@saws/host";
import { RustFSService } from "./rustfs-service.js";
class TestRustFSService extends RustFSService {
    getRunConfig(context) {
        return this.getDockerRunConfig(context);
    }
}
function createProvider() {
    return new DockerProvider({
        host: new Host({ name: "test", address: "example.test" }),
    });
}
test("injects service-scoped RustFS variables for host and container consumers", async () => {
    const service = new RustFSService({
        name: "user-assets",
        docker: createProvider(),
        port: 19000,
        accessKeyId: "access",
        secretAccessKey: "secret",
        region: "us-west-2",
    });
    const context = new DevContext({ stage: "development" });
    assert.deepEqual(await service.getEnvironmentVariables(context), {
        USER_ASSETS_RUSTFS_ENDPOINT: "http://127.0.0.1:19000",
        USER_ASSETS_RUSTFS_ACCESS_KEY_ID: "access",
        USER_ASSETS_RUSTFS_SECRET_ACCESS_KEY: "secret",
        USER_ASSETS_RUSTFS_REGION: "us-west-2",
        USER_ASSETS_RUSTFS_BUCKET: "development-user-assets",
    });
    assert.deepEqual(await service.getEnvironmentVariables(context, "container"), {
        USER_ASSETS_RUSTFS_ENDPOINT: "http://development-user-assets:9000",
        USER_ASSETS_RUSTFS_ACCESS_KEY_ID: "access",
        USER_ASSETS_RUSTFS_SECRET_ACCESS_KEY: "secret",
        USER_ASSETS_RUSTFS_REGION: "us-west-2",
        USER_ASSETS_RUSTFS_BUCKET: "development-user-assets",
    });
});
test("configures persistent storage, RustFS credentials, and published ports", async () => {
    const service = new TestRustFSService({
        name: "assets",
        docker: createProvider(),
        port: 19000,
        consolePort: 19001,
        accessKeyId: "access",
        secretAccessKey: "secret",
    });
    const config = await service.getRunConfig(new DevContext({ stage: "local" }));
    assert.deepEqual(config.ports, ["19000:9000", "19001:9001"]);
    assert.deepEqual(config.volumes, ["local-assets-rustfs-data:/data"]);
    assert.deepEqual(config.command, ["/data"]);
    assert.deepEqual(config.env, {
        RUSTFS_ACCESS_KEY: "access",
        RUSTFS_SECRET_KEY: "secret",
        RUSTFS_CONSOLE_ENABLE: "true",
    });
});

import assert from "node:assert/strict";
import test from "node:test";
import { Files, resolveRustFSConfiguration, rustFSServiceEnvironmentPrefix, } from "./files.js";
const environment = {
    ASSETS_RUSTFS_ENDPOINT: "http://127.0.0.1:9000",
    ASSETS_RUSTFS_ACCESS_KEY_ID: "access",
    ASSETS_RUSTFS_SECRET_ACCESS_KEY: "secret",
    ASSETS_RUSTFS_REGION: "us-west-2",
    ASSETS_RUSTFS_BUCKET: "local-assets",
};
test("derives a safe environment prefix from the service name", () => {
    assert.equal(rustFSServiceEnvironmentPrefix("user-assets.v2"), "USER_ASSETS_V2");
});
test("resolves the complete client configuration from injected environment", () => {
    assert.deepEqual(resolveRustFSConfiguration("assets", environment), {
        endpoint: "http://127.0.0.1:9000",
        accessKeyId: "access",
        secretAccessKey: "secret",
        region: "us-west-2",
        bucket: "local-assets",
    });
});
test("constructs an S3 client configured for path-style RustFS requests", async () => {
    const files = new Files("assets", { environment });
    const credentials = await files.client.config.credentials();
    assert.equal(files.bucket, "local-assets");
    assert.equal(await files.client.config.region(), "us-west-2");
    assert.equal(credentials.accessKeyId, "access");
    assert.equal(credentials.secretAccessKey, "secret");
    assert.equal(files.client.config.forcePathStyle, true);
});
test("reports the missing service-specific variable", () => {
    assert.throws(() => new Files("documents", { environment: {} }), /DOCUMENTS_RUSTFS_ENDPOINT/);
});

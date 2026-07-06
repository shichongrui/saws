import assert from "node:assert/strict";
import test from "node:test";
import { Hono } from "hono";
import { HonoClient, resolveHonoServiceUrl, } from "./hono-client.js";
import { honoServiceUrlEnvironmentVariable } from "./hono-http-service.js";
test("derives a parameterized URL variable", () => {
    assert.equal(honoServiceUrlEnvironmentVariable("Public API"), "PUBLIC_API_URL");
});
test("resolves a service URL from an application environment", () => {
    assert.equal(resolveHonoServiceUrl("Public API", {
        PUBLIC_API_URL: "https://api.example.test/",
    }), "https://api.example.test");
});
test("creates a configured Hono RPC client", () => {
    const app = new Hono().get("/health", (context) => context.json({ ok: true }));
    const client = new HonoClient("api", {
        environment: { API_URL: "https://api.example.test" },
    });
    assert.equal(client.health.$url().toString(), "https://api.example.test/health");
});
test("reports the expected variable when configuration is missing", () => {
    assert.throws(() => resolveHonoServiceUrl("missing service", {}), /MISSING_SERVICE_URL/);
});

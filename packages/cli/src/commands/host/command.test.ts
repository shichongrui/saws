import assert from "node:assert/strict";
import test from "node:test";
import { Host } from "@saws/host";
import { selectHost } from "./command.js";

const first = new Host({ name: "first", address: "first.example.test" });
const second = new Host({ name: "second", address: "second.example.test" });

test("selects the only configured host when its name is omitted", () => {
  assert.equal(selectHost([first]), first);
});

test("requires a valid name when several hosts are configured", () => {
  assert.throws(
    () => selectHost([second, first]),
    /Host name is required\. Available hosts: first, second/
  );
  assert.throws(
    () => selectHost([first, second], "missing"),
    /Host "missing" was not found\. Available hosts: first, second/
  );
});

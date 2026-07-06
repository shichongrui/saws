import assert from "node:assert/strict";
import test from "node:test";
import { RuntimeContext } from "./context.js";

test("accepts stage names that are safe for Docker resources and paths", () => {
  for (const stage of ["local", "production", "review-42", "release_1.2"]) {
    assert.equal(new RuntimeContext({ stage }).stage, stage);
  }
});

test("rejects unsafe or ambiguous stage names", () => {
  for (const stage of ["", "../production", "Production", "review 42", "."]) {
    assert.throws(
      () => new RuntimeContext({ stage }),
      /Invalid stage/
    );
  }
});

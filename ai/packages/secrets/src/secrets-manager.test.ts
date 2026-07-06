import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  ParameterNotFoundError,
  SecretsManager,
} from "./secrets-manager.js";

test("resolves a secret reference against the runtime stage and root", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "saws-secrets-"));
  const passcode = "test-passcode";
  await writeFile(
    path.join(rootDir, ".env"),
    `SAWS_SECRETS_PASSCODE=${passcode}\n`
  );
  const production = new SecretsManager({ stage: "production", rootDir });
  const staging = new SecretsManager({ stage: "staging", rootDir });
  const reference = SecretsManager.reference("registry-password");

  await production.set("registry-password", "production-token");
  await staging.set("registry-password", "staging-token");

  assert.equal(
    await reference.resolve({ stage: "production", rootDir }),
    "production-token"
  );
  assert.equal(
    await reference.resolve({ stage: "staging", rootDir }),
    "staging-token"
  );
});

test("rejects empty references and missing referenced secrets", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "saws-secrets-"));

  assert.throws(
    () => SecretsManager.reference("  "),
    /name cannot be empty/
  );
  await assert.rejects(
    SecretsManager.reference("missing").resolve({
      stage: "production",
      rootDir,
    }),
    ParameterNotFoundError
  );
});

test("encrypts secrets on disk and generates a passcode in .env", async (t) => {
  const inheritedPasscode = process.env.SAWS_SECRETS_PASSCODE;
  delete process.env.SAWS_SECRETS_PASSCODE;
  t.after(() => {
    if (inheritedPasscode == null) delete process.env.SAWS_SECRETS_PASSCODE;
    else process.env.SAWS_SECRETS_PASSCODE = inheritedPasscode;
  });

  const rootDir = await mkdtemp(path.join(os.tmpdir(), "saws-secrets-"));
  const manager = new SecretsManager({ stage: "production", rootDir });

  await manager.set("api-key", "plain-text-value");

  const encrypted = await readFile(manager.secretsFilePath, "utf8");
  assert.doesNotMatch(encrypted, /plain-text-value|api-key/);
  assert.equal(JSON.parse(encrypted).cipher.name, "aes-256-gcm");

  const environment = await readFile(path.join(rootDir, ".env"), "utf8");
  assert.match(environment, /^SAWS_SECRETS_PASSCODE=.+\n$/);
  assert.equal(await manager.get("api-key"), "plain-text-value");
});

test("rejects an incorrect passcode", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "saws-secrets-"));
  await new SecretsManager({
    stage: "production",
    rootDir,
    passcode: "correct",
  }).set("api-key", "value");

  await assert.rejects(
    new SecretsManager({
      stage: "production",
      rootDir,
      passcode: "incorrect",
    }).get("api-key"),
    /Unable to decrypt secrets/
  );
});

test("migrates a plaintext secrets file when it is read", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "saws-secrets-"));
  const secretsDir = path.join(rootDir, ".saws", "secrets");
  await mkdir(secretsDir, { recursive: true });
  const secretsPath = path.join(secretsDir, "production.env");
  await writeFile(secretsPath, 'api-key="legacy-value"\n');

  const manager = new SecretsManager({
    stage: "production",
    rootDir,
    passcode: "migration-passcode",
  });
  assert.equal(await manager.get("api-key"), "legacy-value");
  assert.doesNotMatch(await readFile(secretsPath, "utf8"), /legacy-value/);
});

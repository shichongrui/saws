import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { initCommand } from "./command.js";
test("initializes only the selected service branch in dependency order", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "saws-init-"));
    const configPath = path.join(directory, "saws.mjs");
    const packageUrl = pathToFileURL(path.resolve("../core/dist/index.js")).href;
    await writeFile(configPath, `
      import { appendFile } from "node:fs/promises";
      import path from "node:path";
      import { ServiceDefinition } from ${JSON.stringify(packageUrl)};

      class InitializableService extends ServiceDefinition {
        async onInit(context) {
          await appendFile(path.join(context.rootDir, "initialized.txt"), this.name + "\\n");
        }
      }

      const shared = new InitializableService({ name: "shared" });
      const api = new InitializableService({
        name: "api",
        dependencies: [shared],
      });
      const worker = new InitializableService({ name: "worker" });

      export default new InitializableService({
        name: "app",
        dependencies: [api, worker],
      });
    `);
    await initCommand("api", undefined, {
        config: configPath,
        rootDir: directory,
    });
    assert.equal(await readFile(path.join(directory, "initialized.txt"), "utf8"), "shared\napi\n");
});

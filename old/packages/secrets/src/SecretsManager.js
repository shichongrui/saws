"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecretsManager = void 0;
const ssm_1 = require("@saws/aws/ssm");
const constants_1 = require("@saws/utils/constants");
const node_path_1 = require("node:path");
const fs_1 = require("fs");
let cache = {};
class LocalSecretsManager {
    secretsFilePath = (0, node_path_1.resolve)(constants_1.SAWS_DIR, ".secrets");
    async ensureSecretsFileExists() {
        try {
            await fs_1.promises.stat(this.secretsFilePath);
        }
        catch (err) {
            await fs_1.promises.writeFile(this.secretsFilePath, "");
        }
    }
    async fillCache() {
        await this.ensureSecretsFileExists();
        if (Object.keys(cache).length === 0) {
            const secretsFile = await fs_1.promises.readFile(this.secretsFilePath, {
                encoding: "utf-8",
            });
            cache = (await import("envfile")).parse(secretsFile);
        }
    }
    async get(name) {
        await this.fillCache();
        if (cache[name] == null) {
            const error = new Error("Missing");
            error.name = "ParameterNotFound";
            throw error;
        }
        return cache[name];
    }
    async set(name, value) {
        await this.fillCache();
        cache[name] = value;
        await fs_1.promises.writeFile(this.secretsFilePath, (await import("envfile")).stringify(cache));
    }
}
class ParameterStoreSecretsManager {
    stage;
    ssmClient;
    constructor(stage) {
        this.stage = stage ?? process.env.STAGE;
        this.ssmClient = new ssm_1.SSM();
    }
    async get(name) {
        if (cache[name] != null) {
            return cache[name];
        }
        const value = await this.ssmClient.getParameter(`/${this.stage}/${name}`, true);
        cache[name] = value;
        return value;
    }
    async set(name, value) {
        cache[name] = value;
        await this.ssmClient.putParameter(`/${this.stage}/${name}`, value, true);
    }
}
class SecretsManager {
    manager;
    constructor(stage = String(process.env.STAGE)) {
        this.manager =
            stage === "local"
                ? new LocalSecretsManager()
                : new ParameterStoreSecretsManager(stage);
    }
    get(name) {
        return this.manager.get(name);
    }
    set(name, value) {
        return this.manager.set(name, value);
    }
}
exports.SecretsManager = SecretsManager;

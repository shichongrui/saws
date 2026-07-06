"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecretsService = void 0;
const core_1 = require("@saws/core");
const SecretsManager_1 = require("./SecretsManager");
const commander_1 = require("commander");
class SecretsService extends core_1.ServiceDefinition {
    static getCommands() {
        const command = new commander_1.Command("secrets")
            .option("--stage <string>", "Stage")
            .option("--set <string>", "Set a secret as value")
            .option("--get", "Get a secret")
            .argument("<string>", "The name of the secret")
            .action(async (name, { stage = 'local', set, get }) => {
            const secretsManager = new SecretsManager_1.SecretsManager(stage);
            if (get) {
                const secret = await secretsManager.get(name);
                console.log(secret);
            }
            else {
                await secretsManager.set(name, set);
                console.log("Set secret");
            }
        });
        return [command];
    }
}
exports.SecretsService = SecretsService;

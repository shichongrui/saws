import { ServiceDefinition } from "@saws/core";
import { SecretsManager } from "./SecretsManager";
import { Command } from "commander";

export class SecretsService extends ServiceDefinition {
  static getCommands() {
    const command = new Command("secrets")
      .option("--stage <string>", "Stage")
      .option("--set <string>", "Set a secret as value")
      .option("--get", "Get a secret")
      .argument("<string>", "The name of the secret")
      .action(
        async (
          name: string,
          { stage = 'local', set, get }: { stage: string; set: string; get: boolean }
        ) => {
          const secretsManager = new SecretsManager(stage);

          if (get) {
            const secret = await secretsManager.get(name);
            console.log(secret);
          } else {
            await secretsManager.set(name, set);
            console.log("Set secret");
          }
        }
      );

    return [command];
  }
}

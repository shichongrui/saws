import { Readable } from "stream";
import { ServiceDefinition } from "../ServiceDefinition";

export class TranslateService extends ServiceDefinition {
  async dev() {
    // no op
  }

  async deploy(stage: string) {
    // no op
  }

  async getEnvironmentVariables(_: string) {
    return {};
  }

  getStdOut() {
    return null;
  }

  getPermissions() {
    return [
      {
        Effect: "Allow" as const,
        Action: ["translate:TranslateText"],
        Resource: "*",
      },
    ];
  }

  exit() {
    // no op
  }
}

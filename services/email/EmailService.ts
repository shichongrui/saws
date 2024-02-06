import { ServiceDefinition } from "../ServiceDefinition";

export class EmailService extends ServiceDefinition {
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
        Action: ["ses:SendEmail", "ses:SendRawEmail"],
        Resource: "*",
      },
    ];
  }

  exit() {
    // no op
  }
}

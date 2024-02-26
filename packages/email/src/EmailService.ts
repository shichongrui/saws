import { ServiceDefinition } from "@shichongrui/saws-core";

export class EmailService extends ServiceDefinition {
  getPermissions() {
    return [
      {
        Effect: "Allow" as const,
        Action: ["ses:SendEmail", "ses:SendRawEmail"],
        Resource: "*",
      },
    ];
  }
}

import { ServiceDefinition } from "@shichongrui/saws-core";

export class TranslateService extends ServiceDefinition {
  getPermissions() {
    return [
      {
        Effect: "Allow" as const,
        Action: ["translate:TranslateText"],
        Resource: "*",
      },
    ];
  }
}

import path from "path";
import {
  ServiceDefinition,
  ServiceDefinitionConfig,
} from "../ServiceDefinition";
import { lambdaServer } from "../../utils/LambdaServer";

export type FunctionRuntime = "typescript" | "container";

export interface FunctionServiceConfig extends ServiceDefinitionConfig {
  rootDir?: string;
  runtime: FunctionRuntime;
  memory?: number;
}

export class FunctionService extends ServiceDefinition {
  runtime: FunctionRuntime;
  rootDir: string;
  memory?: number;

  constructor(config: FunctionServiceConfig) {
    super(config);
    this.runtime = config.runtime;
    this.rootDir = path.resolve(".", config.rootDir ?? this.name);
    this.memory = config.memory;

    lambdaServer.registerFunction(this);
  }

  async getEnvironmentVariables() {
    return {};
  }

  getPermissions(stage: string) {
    return [
      {
        Effect: "Allow" as const,
        Action: ["lambda:InvokeFunction"],
        Resource: {
          "Fn::Sub": `arn:aws:lambda:\${AWS::Region}:\${AWS::AccountId}:function:${stage}-${
            this.name
          }`,
        },
      },
    ];
  }
}

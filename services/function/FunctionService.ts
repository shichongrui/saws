import path from "path";
import { Readable } from "stream";
import { ServiceDefinition, ServiceDefinitionConfig } from "../ServiceDefinition";
import { lambdaServer } from "../../utils/LambdaServer";
import { getProjectName } from "../../utils/get-project-name";

export type FunctionRuntime = 'typescript' | 'container'

export interface FunctionServiceConfig extends ServiceDefinitionConfig {
  rootDir?: string;
  runtime: FunctionRuntime;
  memory?: number;
}

export abstract class FunctionService extends ServiceDefinition {
  runtime: FunctionRuntime;
  rootDir: string;
  memory?: number;

  constructor(
    config: FunctionServiceConfig,
  ) {
    super(config)
    this.runtime = config.runtime;
    this.rootDir = path.resolve(".", config.rootDir ?? this.name);
    this.memory = config.memory;

    lambdaServer.registerFunction(this);
  }

  abstract build(...args: any[]): Promise<unknown>;

  abstract dev(): Promise<void>;

  abstract deploy(stage: string): Promise<void>;

  async getEnvironmentVariables() {
    return {
      [this.parameterizedEnvVarName('PROJECT_NAME')]: getProjectName(),
    };
  }

  abstract getStdOut(): Readable | null | undefined;

  abstract exit(): void;

  getPermissions(stage: string) {
    return [
      {
        Effect: "Allow" as const,
        Action: ["lambda:InvokeFunction"],
        Resource: {
          "Fn::Sub": `arn:aws:lambda:\${AWS::Region}:\${AWS::AccountId}:function:${getProjectName()}-${stage}-${
            this.name
          }`,
        },
      },
    ];
  }
}

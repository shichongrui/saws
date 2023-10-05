import {
  FunctionConfig,
  FunctionRuntime,
  ModuleType,
  getProjectName,
} from "@shichongrui/saws-core";
import { lambdaServer } from "../../LambdaServer";
import { ModuleDefinition, Outputs } from "../ModuleDefinition";
import path from "path";
import { Readable } from "stream";

export abstract class Function implements ModuleDefinition {
  type: ModuleType.FUNCTION = ModuleType.FUNCTION;
  displayName: string;
  runtime: FunctionRuntime;
  rootDir: string;
  name: string;
  dependencies: ModuleDefinition[];
  outputs: Outputs = {};

  constructor(
    name: string,
    config: FunctionConfig,
    dependencies: ModuleDefinition[]
  ) {
    this.name = name;
    this.displayName = config.displayName ?? name;
    this.runtime = config.runtime;
    this.rootDir = path.resolve(".", config.rootDir ?? this.name);
    this.dependencies = dependencies;

    lambdaServer.registerFunction(this);
  }

  abstract build(...args: any[]): Promise<unknown>;

  abstract dev(): Promise<void>;

  abstract deploy(stage: string): Promise<void>;

  teardown() {
    return null;
  }

  getOutputs() {
    return {};
  }

  setOutputs(outputs: Outputs) {
    this.outputs = {
      ...this.outputs,
      ...outputs,
    };
  }

  async getEnvironmentVariables() {
    return {
      PROJECT_NAME: getProjectName(),
    };
  }

  abstract getStdOut(): Readable | null | undefined;

  abstract exit(): void;

  getPermissions(_: ModuleType, stage: string) {
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

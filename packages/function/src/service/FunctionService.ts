import path from "path";
import {
  ServiceDefinition,
  ServiceDefinitionConfig,
} from "@saws/core";
import {
  CreateCloudFormationTemplateCommand,
  GetApplicationCommand,
  ServerlessApplicationRepositoryClient,
} from "@aws-sdk/client-serverlessapplicationrepository";
import yaml from "js-yaml";
import { uppercase } from "@saws/utils/uppercase";

export type FunctionRuntime = "typescript" | "container";

export interface FunctionServiceConfig extends ServiceDefinitionConfig {
  rootDir?: string;
  runtime: FunctionRuntime;
  memory?: number;
  layers?: string[];
}

export class FunctionService extends ServiceDefinition {
  runtime: FunctionRuntime;
  rootDir: string;
  memory?: number;
  layers: string[];

  serverlessRepoClient = new ServerlessApplicationRepositoryClient();

  constructor(config: FunctionServiceConfig) {
    super(config);
    this.runtime = config.runtime;
    this.rootDir = path.resolve(".", config.rootDir ?? this.name);
    this.memory = config.memory;
    this.layers = config.layers || [];
  }

  async getEnvironmentVariables(_: string) {
    return {};
  }

  async getLayerTemplate(layerArn: string, stage: string) {
    const details = await this.serverlessRepoClient.send(
      new GetApplicationCommand({
        ApplicationId: layerArn,
      })
    );

    const command = new CreateCloudFormationTemplateCommand({
      ApplicationId: layerArn,
    });
    const response = await this.serverlessRepoClient.send(command);

    const templateRes = await fetch(response.TemplateUrl ?? "");
    const templateYml = await templateRes.text();

    const fullTemplate = yaml.load(templateYml) as any;
    const [name, template] = Object.entries(fullTemplate.Resources)[0];
    return {
      name: `${details.Name?.split("-")
        .map(uppercase)
        .join("")}${stage}${name}`,
      template,
    };
  }

  getPermissions(stage: string) {
    return [
      {
        Effect: "Allow" as const,
        Action: ["lambda:InvokeFunction"],
        Resource: {
          "Fn::Sub": `arn:aws:lambda:\${AWS::Region}:\${AWS::AccountId}:function:${stage}-${this.name}`,
        },
      },
    ];
  }
}

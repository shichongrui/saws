import { ServiceType } from "@aws-sdk/client-ec2";
import getPort from "get-port";
import {
  FunctionConfig,
  FunctionRuntime,
  ModuleType,
  SawsConfig,
} from "../../../config";
import { ChildProcess, exec, spawn } from "child_process";
import { LambdaServer } from "../../LambdaServer";
import { ModuleDefinition, Outputs } from "../ModuleDefinition";
import path from "path";
import { Readable } from "stream";
import { loginToAWSDocker, pushImage, tagImage, waitForContainerToBeStopped } from "../../cli-commands/docker";
import { getProjectName } from "../../../utils/get-project-name";
import { CloudFormation } from "../../../aws/cloudformation";
import { getStackName as getRepositoryStackName, getTemplate as getRepositoryTemplate } from "./repository-cloud-formation.template";
import getAwsAccountId from "../../../utils/get-aws-account-id";
import { getStackName, getTemplate } from "./cloud-formation.template";

const lambdaServer = new LambdaServer();

export class Function implements ModuleDefinition, FunctionConfig {
  type: ModuleType.FUNCTION = ModuleType.FUNCTION;
  displayName: string;
  runtime: FunctionRuntime;
  configPort?: number;
  port?: number;
  rootDir: string;
  name: string;
  process?: ChildProcess;
  dependencies: ModuleDefinition[];

  constructor(name: string, config: FunctionConfig, dependencies: ModuleDefinition[]) {
    this.name = name;
    this.displayName = config.displayName ?? name;
    this.runtime = config.runtime;
    this.configPort = config.port;
    this.rootDir = path.resolve(".", config.rootDir ?? this.name);
    this.dependencies = dependencies;

    lambdaServer.registerFunction(this);
  }

  async build() {
    return new Promise((resolve, reject) => {
      console.log("Building container function", this.name);
      exec(
        `docker build -t ${this.name} .`,
        {
          env: {
            DOCKER_BUILDKIT: "0",
            COMPOSE_DOCKER_CLI_BUILD: "0",
          },
          cwd: this.rootDir,
        },
        (err) => {
          if (err) return reject(err);
          resolve(null);
        }
      );
    });
  }

  async dev() {
    await lambdaServer.start();

    await waitForContainerToBeStopped(this.name);

    await this.build();

    const port = await this.getPort();

    this.process = spawn("docker", [
      "run",
      "--rm",
      "--name",
      this.name,
      "-p",
      `${port}:8080`,
      this.name,
    ]);

    return;
  }

  async deploy(stage: string) {
    console.log('Creating ECS repository for', this.displayName)
    // build repository
    const cloudformationClient = new CloudFormation();

    const repositoryTemplate = getRepositoryTemplate({
      name: this.name,
      stage,
    })
    const repositoryStackName = getRepositoryStackName(stage, this.name)
    await cloudformationClient.deployStack(repositoryStackName, repositoryTemplate);

    console.log('Deploying function', this.displayName);
    const accountId = await getAwsAccountId();
    if (accountId == null) throw new Error("No account Id found");
    await loginToAWSDocker(accountId);

    await this.build()
    const repositoryName = `${this.name}-${stage}`
    await tagImage(this.name, accountId, repositoryName, "latest");
    await pushImage(accountId, repositoryName, "latest");

    const projectName = getProjectName();
    await cloudformationClient.deployStack(
      getStackName(stage, this.name),
      getTemplate({
        name: this.name,
        repositoryName: repositoryName,
        tag: "latest",
        projectName,
        stage,
      })
    );

    return;
  }

  teardown() {
    return null;
  }

  getOutputs() {
    return {};
  }

  getEnvironmentVariables() {
    return {
      PROJECT_NAME: getProjectName()
    };
  }

  getStdOut() {
    return this.process?.stdout;
  }

  async getPort() {
    if (this.port != null) return this.port
    this.port = await getPort({ port: this.configPort });
    return this.port;
  }

  exit() {
    this.process?.kill();
  }

  getPermissionsTemplate(stage: string) {
    const projectName = getProjectName()
    return JSON.stringify({
      Effect: "Allow",
      Action: ["lambda:InvokeFunction"],
      Resource: { "Fn::Sub": `arn:aws:lambda:\${AWS::Region}:\${AWS::AccountId}:function:${projectName}-${stage}-${this.name}` },
    })
  }
}

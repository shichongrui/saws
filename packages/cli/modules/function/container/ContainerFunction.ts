import getPort from "get-port";
import { ContainerFunctionConfig, ModuleType } from "../../../../config";
import { ChildProcess, exec, spawn } from "child_process";
import { lambdaServer } from "../../../LambdaServer";
import { ModuleDefinition, Outputs } from "../../ModuleDefinition";
import {
  loginToAWSDocker,
  pushImage,
  tagImage,
  waitForContainerToBeStopped,
} from "../../../cli-commands/docker";
import { getProjectName } from "../../../../utils/get-project-name";
import { CloudFormation } from "../../../../aws/cloudformation";
import {
  getStackName as getRepositoryStackName,
  getTemplate as getRepositoryTemplate,
} from "./repository-cloud-formation.template";
import getAwsAccountId from "../../../../utils/get-aws-account-id";
import { getStackName, getTemplate } from "./cloud-formation.template";
import { watch } from "chokidar";
import { Function } from "../Function";

export class ContainerFunction extends Function {
  type: ModuleType.FUNCTION = ModuleType.FUNCTION;
  configPort?: number;
  port?: number;
  memory?: number;
  process?: ChildProcess;
  outputs: Outputs = {};

  constructor(
    name: string,
    config: ContainerFunctionConfig,
    dependencies: ModuleDefinition[]
  ) {
    super(name, config, dependencies)
    
    this.configPort = config.port;
    this.memory = config.memory;
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

    watch(this.rootDir, { ignoreInitial: true }).on("all", async () => {
      console.log("Detected changes in", this.displayName);
      this.exit();
      await waitForContainerToBeStopped(this.name);
      await this.build();
      this.process = spawn("docker", [
        "run",
        "--rm",
        "--name",
        this.name,
        "-p",
        `${port}:8080`,
        this.name,
      ]);
      this.process.stdout?.pipe(process.stdout)
      console.log(this.displayName, 'ready')
    });

    return;
  }

  async deploy(stage: string) {
    console.log("Creating ECS repository for", this.displayName);
    // build repository
    const cloudformationClient = new CloudFormation();

    const repositoryTemplate = getRepositoryTemplate({
      name: this.name,
      stage,
    });
    const repositoryStackName = getRepositoryStackName(stage, this.name);
    await cloudformationClient.deployStack(
      repositoryStackName,
      repositoryTemplate
    );

    console.log("Deploying function", this.displayName);
    const accountId = await getAwsAccountId();
    if (accountId == null) throw new Error("No account Id found");
    await loginToAWSDocker(accountId);

    await this.build();
    const repositoryName = `${this.name}-${stage}`;
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
        memory: this.memory,
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

  getStdOut() {
    return this.process?.stdout;
  }

  async getPort() {
    if (this.port != null) return this.port;
    this.port = await getPort({ port: this.configPort });
    return this.port;
  }

  exit() {
    this.process?.kill();
  }
}

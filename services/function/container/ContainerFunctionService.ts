import getPort from "get-port";
import { ChildProcess, exec, spawn } from "child_process";
import { getAwsAccountId } from "../../../utils/get-aws-account-id";
import {
  getStackName as getRepositoryStackName,
  getTemplate as getRepositoryTemplate,
} from "./repository-cloud-formation.template";
import { getStackName, getTemplate } from "./cloud-formation.template";
import { watch } from "chokidar";
import { FunctionService, FunctionServiceConfig } from "../FunctionService";
import { lambdaServer } from "../../../utils/LambdaServer";
import { loginToAWSDocker, pushImage, tagImage, waitForContainerToBeStopped } from "../../../helpers/docker";
import { CloudFormation } from "../../../helpers/aws/cloudformation";

interface ContainerFunctionServiceConfig extends FunctionServiceConfig {
  port?: number;
}

export class ContainerFunctionService extends FunctionService {
  configPort?: number;
  port?: number;
  process?: ChildProcess;

  constructor(
    config: ContainerFunctionServiceConfig,
  ) {
    super({
      ...config,
      runtime: 'container'
    });

    this.configPort = config.port;
  }

  async build() {
    return new Promise((resolve, reject) => {
      console.log("Building container function", this.name);
      exec(
        `docker build -t ${this.name} .`,
        {
          env: {
            NODE_ENV: 'development',
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
    await super.dev()
    

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
      console.log("Detected changes in", this.name);
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
      this.process.stdout?.pipe(process.stdout);
      console.log(this.name, "ready");
    });

    process.env = {
      ...process.env,
      ...(await this.getEnvironmentVariables())
    }

    return;
  }

  async deploy(stage: string) {
    await super.deploy(stage)
    

    console.log("Creating ECS repository for", this.name);
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

    console.log("Deploying function", this.name);
    const accountId = await getAwsAccountId();
    if (accountId == null) throw new Error("No account Id found");
    await loginToAWSDocker(accountId);

    await this.build();
    const repositoryName = `${this.name}-${stage}`;
    await tagImage(this.name, accountId, repositoryName, "latest");
    await pushImage(accountId, repositoryName, "latest");

    await cloudformationClient.deployStack(
      getStackName(stage, this.name),
      getTemplate({
        name: this.name,
        repositoryName: repositoryName,
        tag: "latest",
        stage,
        memory: this.memory,
      })
    );

    return;
  }

  async getEnvironmentVariables() {
    return {};
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
    this.process = undefined;
  }
}

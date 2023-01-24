import { ChildProcess, exec, spawn } from "child_process";
import getPort from "get-port";
import { watch } from "chokidar";
import path from "path";
import { Readable } from "stream";
import { ContainerConfig, ModuleType } from "../../../config";
import { loginToAWSDocker, pushImage, tagImage, waitForContainerToBeStopped } from "../../cli-commands/docker";
import { ModuleDefinition, Outputs } from "../ModuleDefinition";
import { getTemplate as getRepositoryTemplate, getStackName as getRepositoryStackName } from "./repository-cloud-formation.template";
import { CloudFormation } from "../../../aws/cloudformation";
import getAwsAccountId from "../../../utils/get-aws-account-id";
import { getStackName, getTemplate } from "./cloud-formation.template";
import { getProjectName } from "../../../utils/get-project-name";
import { EC2 } from "../../../aws/ec2";

export class Container implements ModuleDefinition {
  type: ModuleType.CONTAINER = ModuleType.CONTAINER;
  name: string;
  displayName: string;
  port?: number;
  config: ContainerConfig;
  rootDir: string;
  outputs: Outputs = {};
  process?: ChildProcess;
  dependencies: ModuleDefinition[];

  constructor(name: string, config: ContainerConfig, dependencies: ModuleDefinition[]) {
    this.name = name;
    this.displayName = config.displayName ?? name;
    this.rootDir = path.resolve(".", config.rootDir ?? this.name);
    this.dependencies = dependencies;
    this.config = config;
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
    console.log("Starting", this.displayName);

    await waitForContainerToBeStopped(this.name);

    await this.build();
    const port = await this.getPort();

    this.process = spawn("docker", [
      "run",
      "--rm",
      "--name",
      this.name,
      "-e",
      `PORT=${port}`,
      "-p",
      `${port}:${port}`,
      this.name,
    ]);

    watch(this.rootDir, { ignoreInitial: true }).on("all", async () => {
      console.log("Detected changes in", this.displayName);
      this.exit();
      await waitForContainerToBeStopped(this.name);
      console.log('Rebuilding container...')
      await this.build();
      this.process = spawn("docker", [
        "run",
        "--rm",
        "--name",
        this.name,
        "-e",
        `PORT=${port}`,
        "-p",
        `${port}:${port}`,
        this.name,
      ]);
      this.process.stdout?.pipe(process.stdout)
      console.log(this.displayName, 'ready')
    });

    this.setOutputs({
      url: `http://localhost:${port}`,
    })
  }

  async deploy(stage: string) {
    console.log("Deploying Container", this.displayName);

    const cloudformationClient = new CloudFormation();
    const repositoryTemplate = getRepositoryTemplate({
      name: this.name,
      stage,
    })
    const repositoryStackName = getRepositoryStackName(stage, this.name);

    await cloudformationClient.deployStack(repositoryStackName, repositoryTemplate);

    const accountId = await getAwsAccountId();
    if (accountId == null) throw new Error("No account Id found");
    await loginToAWSDocker(accountId);

    await this.build();
    const repositoryName = `${this.name}-${stage}`;
    await tagImage(this.name, accountId, repositoryName, "latest");
    await pushImage(accountId, repositoryName, "latest");

    const port = await this.getPort();

    const environment = await this.dependencies.reduce((acc, dependency) => {
      acc = {
        ...acc,
        ...dependency.getEnvironmentVariables(),
      }
      return acc;
    }, {
      PORT: String(port),
    });

    const ec2Client = new EC2();
    const defaultVpc = await ec2Client.getDefaultVPC();
    const subnets = await ec2Client.getSubnetsForVPC(defaultVpc.VpcId ?? '');

    const template = getTemplate({
      stage,
      projectName: getProjectName(),
      name: this.name,
      repositoryName,
      environment,
      vpcId: defaultVpc.VpcId ?? '',
      subnets: subnets.map(subnet => subnet.SubnetId ?? ''),
      healthCheckUrl: this.config.healthCheckUrl,
    })
    const stackName = getStackName(stage, this.name);

    const results = await cloudformationClient.deployStack(stackName, template);
    const outputs = results?.Stacks?.[0].Outputs;

    this.setOutputs({
      ...Object.fromEntries(
        outputs?.map(({ OutputKey, OutputValue }) => [
          OutputKey,
          OutputValue,
        ]) ?? []
      ),
    });
  }

  async getPort() {
    if (this.port != null) return this.port;
    this.port = await getPort({ port: this.config.port });
    return this.port;
  }

  setOutputs(outputs: Outputs) {
    this.outputs = {
      ...this.outputs,
      ...outputs,
    };
  }

  getOutputs() {
    return this.outputs;
  }

  getEnvironmentVariables() {
    const envVarName = this.name.replace('-', '_').toUpperCase() + '_URL';
    return {
      [envVarName]: String(this.outputs.url),
    };
  }

  getStdOut() {
    return this.process?.stdout;
  }

  exit() {
    exec(`docker stop ${this.name}`)
    this.process?.kill();
  }
}

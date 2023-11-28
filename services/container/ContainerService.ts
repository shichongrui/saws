import { ChildProcess, exec, spawn } from "child_process";
import getPort from "get-port";
import { watch } from "chokidar";
import path from "path";
import {
  getTemplate as getRepositoryTemplate,
  getStackName as getRepositoryStackName,
} from "./repository-cloud-formation.template";
import { getAwsAccountId } from "../../utils/get-aws-account-id";
import { getStackName, getTemplate } from "./cloud-formation.template";
import { ServiceDefinition, ServiceDefinitionConfig } from "../ServiceDefinition";
import { CloudFormation } from "../../helpers/aws/cloudformation";
import { pushImage, tagImage, loginToAWSDocker, waitForContainerToBeStopped } from "../../helpers/docker";
import { EC2 } from "../../helpers/aws/ec2";

interface ContainerServiceConfig extends ServiceDefinitionConfig {
  port?: number;
  rootDir?: string;
  healthCheckUrl?: string;
}

export class ContainerService extends ServiceDefinition {
  configPort?: number;
  port?: number;
  rootDir: string;
  process?: ChildProcess;
  healthCheckUrl?: string;

  constructor(
    config: ContainerServiceConfig,
  ) {
    super(config)
    this.rootDir = path.resolve(".", config.rootDir ?? this.name);
    this.healthCheckUrl = config.healthCheckUrl;
    this.configPort = config.port;
  }

  async build() {
    return new Promise((resolve, reject) => {
      console.log("Building container", this.name);
      exec(
        `docker build -t ${this.name} .`,
        {
          env: {
            DOCKER_BUILDKIT: "0",
            COMPOSE_DOCKER_CLI_BUILD: "0",
            NODE_ENV: "development",
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

    console.log("Starting container", this.name);

    watch(this.rootDir, { ignoreInitial: true }).on("all", async () => {
      console.log("Detected changes in", this.name);
      this.exit();
      await waitForContainerToBeStopped(this.name);
      console.log("Rebuilding container...");
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
      this.process.stdout?.pipe(process.stdout);
      console.log(this.name, "ready");
    });

    await this.setOutputs({
      url: `http://localhost:${port}`,
    }, 'local');

    process.env = {
      ...process.env,
      ...(await this.getEnvironmentVariables('local'))
    }
  }

  async deploy(stage: string) {
    await super.deploy(stage)
    
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

    const accountId = await getAwsAccountId();
    if (accountId == null) throw new Error("No account Id found");
    await loginToAWSDocker(accountId);

    await this.build();
    const repositoryName = `${this.name}-${stage}`;
    await tagImage(this.name, accountId, repositoryName, "latest");
    await pushImage(accountId, repositoryName, "latest");

    const port = await this.getPort();

    let environment = {
      PORT: String(port),
    }
    for (const dependency of this.dependencies) {
      environment = {
        ...environment,
        ...(await dependency.getEnvironmentVariables(stage))
      }
    }

    const ec2Client = new EC2();
    const defaultVpc = await ec2Client.getDefaultVPC();
    const subnets = await ec2Client.getSubnetsForVPC(defaultVpc.VpcId ?? "");

    const template = getTemplate({
      stage,
      name: this.name,
      repositoryName,
      environment,
      vpcId: defaultVpc.VpcId ?? "",
      subnets: subnets.map((subnet) => subnet.SubnetId ?? ""),
      healthCheckUrl: this.healthCheckUrl,
    });
    const stackName = getStackName(stage, this.name);

    const results = await cloudformationClient.deployStack(stackName, template);
    const outputs = results?.Stacks?.[0].Outputs;

    await this.setOutputs({
      ...Object.fromEntries(
        outputs?.map(({ OutputKey, OutputValue }) => [
          OutputKey,
          OutputValue,
        ]) ?? []
      ),
    }, stage);
  }

  async getPort() {
    if (this.port != null) return this.port;
    this.port = await getPort({ port: this.configPort });
    return this.port;
  }

  async getEnvironmentVariables(_: string) {
    return {
      [this.parameterizedEnvVarName('URL')]: String(this.outputs.url),
    };
  }

  getStdOut() {
    return this.process?.stdout;
  }

  getPermissions() {
    return [];
  }

  exit() {
    exec(`docker stop ${this.name}`);
    this.process?.kill();
    this.process = undefined;
  }
}

import {
  ModuleType,
  PostgresConfig,
  ServiceType,
  DB_PASSWORD_PARAMETER_NAME,
  SAWS_DIR,
  retryUntil,
} from "@shichongrui/saws-core";
import { CloudFormation, EC2 } from "@shichongrui/saws-aws";
import { getDBParameters, getDBPassword } from "../../utils/get-db-parameters";
import { ChildProcess, spawn } from "child_process";
import { Client } from "pg";
import path from "path";
import { ModuleDefinition, Outputs } from "../ModuleDefinition";
import { waitForContainerToBeStopped } from "../../shell-commands/docker";
import {
  generatePrismaClient,
  prismaMigrate,
  pushPrisma,
  seedPrisma,
} from "../../shell-commands/prisma";
import { watch } from "chokidar";
import { getStackName, getTemplate } from "./cloud-formation.template";

export class Postgres implements ModuleDefinition, PostgresConfig {
  type: ServiceType.POSTGRES = ServiceType.POSTGRES;
  name: string;
  displayName: string;
  config: PostgresConfig;
  outputs: Outputs = {};
  process?: ChildProcess;

  private password?: string;

  constructor(name: string, config: PostgresConfig) {
    this.name = name;
    this.displayName = config.displayName ?? name;
    this.config = config;
  }

  async dev() {
    console.log("Starting Postgres...");
    await this.startPostgresDocker();

    await generatePrismaClient();
    const password = await getDBPassword();
    this.password = password;
    // await pushPrisma({
    //   username: String(this.outputs.postgresUsername),
    //   password,
    //   endpoint: String(this.outputs.postgresHost),
    //   port: String(this.outputs.postgresPort),
    //   dbName: String(this.outputs.postgresDBName),
    // });

    // await seedPrisma({
    //   username: String(this.outputs.postgresUsername),
    //   password,
    //   endpoint: String(this.outputs.postgresHost),
    //   port: String(this.outputs.postgresPort),
    //   dbName: String(this.outputs.postgresDBName),
    // });

    watch("./prisma", { ignoreInitial: true }).on("all", async (_, path) => {
      if (path.includes("schema.prisma")) {
        console.log(
          "Detected schema changes, regenerating the prisma client..."
        );
        await generatePrismaClient();

        // await pushPrisma({
        //   username: String(this.outputs.postgresUsername),
        //   password,
        //   endpoint: String(this.outputs.postgresHost),
        //   port: String(this.outputs.postgresPort),
        //   dbName: String(this.outputs.postgresDBName),
        // });
        // await seedPrisma({
        //   username: String(this.outputs.postgresUsername),
        //   password,
        //   endpoint: String(this.outputs.postgresHost),
        //   port: String(this.outputs.postgresPort),
        //   dbName: String(this.outputs.postgresDBName),
        // });
      }

      // if (path.includes("migrations")) {
      //   console.log("Detected new migration. Running migrations...");
      //   await prismaMigrate({
      //     username: String(this.outputs.postgresUsername),
      //     password,
      //     endpoint: String(this.outputs.postgresHost),
      //     port: String(this.outputs.postgresPort),
      //     dbName: String(this.outputs.postgresDBName),
      //   });
      // }
    });
  }

  async deploy(stage: string) {
    console.log("Deploying Postgres", this.displayName);
    const cloudformationClient = new CloudFormation();
    const ec2Client = new EC2();

    const { username, name, password } = await getDBParameters(stage);
    const defaultVpcId = await ec2Client.getDefaultVPCId();
    const template = getTemplate({
      stage,
      dbName: name,
      dbUsername: username,
      dbPasswordParameterName: DB_PASSWORD_PARAMETER_NAME,
      vpcId: defaultVpcId,
    });
    const stackName = getStackName(stage);

    const results = await cloudformationClient.deployStack(stackName, template);

    const outputs = results?.Stacks?.[0].Outputs;

    this.setOutputs({
      ...Object.fromEntries(
        outputs?.map(({ OutputKey, OutputValue }) => [
          OutputKey,
          OutputValue,
        ]) ?? []
      ),
      postgresUsername: username,
      postgresDBName: name,
    });

    console.log({
      username,
      password,
      endpoint: String(this.outputs.postgresHost),
      port: String(this.outputs.postgresPort),
      dbName: name,
    });

    console.log("Running db migrations...");
    await prismaMigrate({
      username,
      password,
      endpoint: String(this.outputs.postgresHost),
      port: String(this.outputs.postgresPort),
      dbName: name,
    });

    return;
  }

  teardown() {
    return null;
  }

  async startPostgresDocker() {
    await waitForContainerToBeStopped(`${this.name}-postgres`);

    const password = await getDBPassword("local");
    this.password = password;

    const childProcess = spawn("docker", [
      "run",
      "--rm",
      "--name",
      `${this.name}-postgres`,
      "-e",
      `POSTGRES_DB=${this.name}`,
      "-e",
      `POSTGRES_PASSWORD=${password}`,
      "-p",
      "5432:5432",
      "-v",
      `${path.resolve(SAWS_DIR, "postgres")}/:/var/lib/postgresql/data`,
      "postgres:14",
    ]);

    await retryUntil(async () => {
      const client = new Client({
        user: "postgres",
        password,
      });
      try {
        await client.connect();
        await client.end();
        return true;
      } catch (err) {
        await client.end();
        return false;
      }
    }, 1000);

    this.setOutputs({
      postgresHost: "localhost",
      postgresPort: "5432",
      postgresUsername: "postgres",
      postgresDBName: this.name,
    });

    this.process = childProcess;
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

  async getEnvironmentVariables() {
    return {
      DATABASE_USERNAME: String(this.outputs.postgresUsername),
      DATABASE_HOST: String(this.outputs.postgresHost),
      DATABASE_PORT: String(this.outputs.postgresPort),
      DATABASE_NAME: String(this.outputs.postgresDBName),
      DATABASE_URL: `postgres://${
        this.outputs.postgresUsername
      }:${await getDBPassword()}@${this.outputs.postgresHost}:${
        this.outputs.postgresPort
      }/${this.outputs.postgresDBName}`,
    };
  }

  getStdOut() {
    return this.process?.stdout;
  }

  getPermissions(_: ModuleType, __: string) {
    return [];
  }

  exit() {
    this.process?.kill();
  }
}
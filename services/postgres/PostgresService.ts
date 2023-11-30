import {
  getDBName,
  getDBParameters,
  getDBPassword,
  getDBPasswordParameterName,
} from "./get-db-parameters";
import { ChildProcess } from "node:child_process";
import path from "node:path";
import {
  generatePrismaClient,
  prismaMigrate,
} from "../../helpers/prisma";
import { getStackName, getTemplate } from "./cloud-formation.template";
import { ServiceDefinition } from "../ServiceDefinition";
import { watch } from "chokidar";
import { CloudFormation } from "../../helpers/aws/cloudformation";
import { EC2 } from "../../helpers/aws/ec2";

import { SAWS_DIR } from "../../utils/constants";
import { Client } from "pg";
import { startContainer } from "../../helpers/docker";

export class PostgresService extends ServiceDefinition {
  static process?: ChildProcess;
  private dbPassword?: string;

  async dev() {
    await super.dev();

    await this.startPostgresDocker();
    await this.createDB();

    await generatePrismaClient();

    watch("./prisma", { ignoreInitial: true }).on("all", async (_, path) => {
      if (path.includes("schema.prisma")) {
        console.log(
          "Detected schema changes, regenerating the prisma client..."
        );
        await generatePrismaClient();
      }
    });

    process.env = {
      ...process.env,
      ...(await this.getEnvironmentVariables('local'))
    }
  }

  async deploy(stage: string) {
    await super.deploy(stage);

    const cloudformationClient = new CloudFormation();
    const ec2Client = new EC2();

    const { username, name, password } = await getDBParameters(
      this.name,
      stage
    );
    const defaultVpcId = await ec2Client.getDefaultVPCId();
    const template = getTemplate({
      stage,
      dbName: name,
      dbUsername: username,
      dbPasswordParameterName: getDBPasswordParameterName(this.name, stage),
      vpcId: defaultVpcId,
    });
    const stackName = getStackName(stage, this.name);

    const results = await cloudformationClient.deployStack(stackName, template);

    const outputs = results?.Stacks?.[0].Outputs;

    await this.setOutputs(
      {
        ...Object.fromEntries(
          outputs?.map(({ OutputKey, OutputValue }) => [
            OutputKey,
            OutputValue,
          ]) ?? []
        ),
        postgresUsername: username,
        postgresDBName: name,
      },
      stage
    );

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

  async startPostgresDocker() {
    console.log("Starting postgres docker container");

    const password = await getDBPassword(this.name, "local");
    this.dbPassword = password;

    if (PostgresService.process == null) {
      PostgresService.process = await startContainer({
        name: this.name,
        additionalArguments: [
          "-e",
          `POSTGRES_PASSWORD=${password}`,
          "-p",
          "5432:5432",
          "-v",
          `${path.resolve(SAWS_DIR, "postgres")}/:/var/lib/postgresql/data`,
        ],
        image: "postgres:14",
        check: async () => {
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
        },
      });
    }

    await this.setOutputs(
      {
        postgresHost: "localhost",
        postgresPort: "5432",
        postgresUsername: "postgres",
        postgresDBName: getDBName(this.name, "local"),
      },
      "local"
    );
  }

  async createDB() {
    const password = this.dbPassword;
    if (password == null) return;
    const client = new Client({
      user: "postgres",
      password,
    });

    await client.connect();
    const value = await client.query(
      `SELECT FROM pg_database WHERE datname = '${getDBName(
        this.name,
        "local"
      )}'`
    );

    if (value.rows.length > 0) return;

    console.log("DB did not exist. Creating and running migrations");
    await client.query(`CREATE DATABASE ${getDBName(this.name, "local")}`);
    try {
      await prismaMigrate({
        username: String(this.outputs.postgresUsername),
        password,
        endpoint: String(this.outputs.postgresHost),
        dbName: String(this.outputs.postgresDBName),
        port: String(this.outputs.postgresPort),
      });
    } catch (err) {
      console.log("error", err);
    }
  }

  exit() {
    PostgresService.process?.kill();
    PostgresService.process = undefined;
  }

  async getEnvironmentVariables(stage: string) {
    const password = await getDBPassword(this.name, stage);
    return {
      [this.parameterizedEnvVarName("POSTGRES_USERNAME")]: String(
        this.outputs.postgresUsername
      ),
      [this.parameterizedEnvVarName("POSTGRES_PASSWORD")]: password,
      [this.parameterizedEnvVarName("POSTGRES_HOST")]: String(
        this.outputs.postgresHost
      ),
      [this.parameterizedEnvVarName("POSTGRES_PORT")]: String(
        this.outputs.postgresPort
      ),
      [this.parameterizedEnvVarName("POSTGRES_DB_NAME")]: String(
        this.outputs.postgresDBName
      ),
    };
  }

  getStdOut() {
    return PostgresService.process?.stdout;
  }
}

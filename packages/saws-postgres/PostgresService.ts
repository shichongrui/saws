import {
  SAWS_DIR,
  ServiceDefinition,
  ServiceDefinitionConfig,
  startContainer,
  uppercase,
  waitForContainerToBeStopped,
} from "@shichongrui/saws-core";
import {
  getDBName,
  getDBParameters,
  getDBPassword,
  getDBPasswordParameterName,
} from "./src/get-db-parameters";
import { ChildProcess } from "node:child_process";
import { Client } from "pg";
import path from "node:path";
import {
  generatePrismaClient,
  prismaMigrate,
  runMigrationsLocally,
} from "./src/prisma";
import { watch } from "chokidar";
import { CloudFormation, EC2 } from "@shichongrui/saws-aws";
import { getStackName, getTemplate } from "./cloud-formation.template";

export class PostgresService extends ServiceDefinition {
  static process?: ChildProcess;

  private dbPassword?: string;

  constructor(config: ServiceDefinitionConfig) {
    super(config);
  }

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
  }

  async deploy(stage: string) {
    console.log("Deploying Postgres", this.name);
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
    const stackName = getStackName(stage);

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
    await waitForContainerToBeStopped(`${this.name}-postgres`);

    const password = await getDBPassword(this.name, "local");
    this.dbPassword = password;

    if (PostgresService.process == null) {
      PostgresService.process = await startContainer({
        name: "postgres",
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

    await runMigrationsLocally({
      username: String(this.outputs.postgresUsername),
      password,
      endpoint: String(this.outputs.postgresHost),
      dbName: String(this.outputs.postgresDBName),
      port: String(this.outputs.postgresPort),
    });
  }

  exit() {
    PostgresService.process?.kill();
    PostgresService.process = undefined;
  }

  async getEnvironmentVariables() {
    const parameterizedName = (name: string) =>
      `${uppercase(this.name.replace(/[^a-zA-Z\d]/g, "_"))}_${name}`;

    const password = await getDBPassword(this.name, "local");
    return {
      [parameterizedName("POSTGRES_USERNAME")]: String(
        this.outputs.postgresUsername
      ),
      [parameterizedName("POSTGRES_PASSWORD")]: password,
      [parameterizedName("POSTGRES_ENDPOINT")]: String(
        this.outputs.postgresHost
      ),
      [parameterizedName("POSTGRES_PORT")]: String(this.outputs.postgresPort),
      [parameterizedName("POSTGRES_DB_NAME")]: String(
        this.outputs.postgresDBName
      ),
    };
  }

  getStdOut() {
    return PostgresService.process?.stdout;
  }
}

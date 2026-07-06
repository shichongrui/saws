"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostgresService = void 0;
const get_db_parameters_1 = require("./get-db-parameters");
const node_path_1 = __importDefault(require("node:path"));
const prisma_helpers_1 = require("./prisma-helpers");
const cloud_formation_template_1 = require("./cloud-formation.template");
const core_1 = require("@saws/core");
const chokidar_1 = require("chokidar");
const cloudformation_1 = require("@saws/aws/cloudformation");
const ec2_1 = require("@saws/aws/ec2");
const constants_1 = require("@saws/utils/constants");
const pg_1 = require("pg");
const docker_1 = require("@saws/utils/docker");
const dependency_management_1 = require("@saws/utils/dependency-management");
const create_file_if_not_exists_1 = require("@saws/utils/create-file-if-not-exists");
const node_fs_1 = __importDefault(require("node:fs"));
const schema_prisma_template_1 = require("./templates/schema-prisma.template");
const env_template_1 = require("./templates/env.template");
class PostgresService extends core_1.ServiceDefinition {
    static process;
    dbPassword;
    imageName;
    constructor(config) {
        super(config);
        this.imageName = config.imageName ?? "postgres:14";
    }
    async init() {
        const requiredDependencies = ['@prisma/client'];
        await (0, dependency_management_1.installMissingDependencies)(requiredDependencies);
        const requiredDevDependencies = ['prisma'];
        await (0, dependency_management_1.installMissingDependencies)(requiredDevDependencies, { development: true });
        node_fs_1.default.mkdirSync(node_path_1.default.resolve('./prisma'), { recursive: true });
        (0, create_file_if_not_exists_1.createFileIfNotExists)(node_path_1.default.resolve('./prisma/schema.prisma'), (0, schema_prisma_template_1.schemaPrismaTemplate)());
        const password = await (0, get_db_parameters_1.getDBPassword)(this.name, "local");
        (0, create_file_if_not_exists_1.createFileIfNotExists)(node_path_1.default.resolve('.env'), (0, env_template_1.envTemplate)({
            dbName: (0, get_db_parameters_1.getDBName)(this.name, 'local'),
            password,
        }));
    }
    async dev() {
        await super.dev();
        await this.startPostgresDocker();
        await this.createDB();
        await (0, prisma_helpers_1.generatePrismaClient)();
        (0, chokidar_1.watch)("./prisma", { ignoreInitial: true }).on("all", async (_, path) => {
            if (path.includes("schema.prisma")) {
                console.log("Detected schema changes, regenerating the prisma client...");
                await (0, prisma_helpers_1.generatePrismaClient)();
            }
        });
    }
    async deploy(stage) {
        await super.deploy(stage);
        const cloudformationClient = new cloudformation_1.CloudFormation();
        const ec2Client = new ec2_1.EC2();
        const { username, name, password } = await (0, get_db_parameters_1.getDBParameters)(this.name, stage);
        const defaultVpcId = await ec2Client.getDefaultVPCId();
        const template = (0, cloud_formation_template_1.getTemplate)({
            stage,
            dbName: name,
            dbUsername: username,
            dbPasswordParameterName: (0, get_db_parameters_1.getDBPasswordParameterName)(this.name, stage),
            vpcId: defaultVpcId,
        });
        const stackName = (0, cloud_formation_template_1.getStackName)(stage, this.name);
        const results = await cloudformationClient.deployStack(stackName, template);
        const outputs = results?.Stacks?.[0].Outputs;
        await this.setOutputs({
            ...Object.fromEntries(outputs?.map(({ OutputKey, OutputValue }) => [
                OutputKey,
                OutputValue,
            ]) ?? []),
            postgresUsername: username,
            postgresDBName: name,
        }, stage);
        console.log("Running db migrations...");
        await (0, prisma_helpers_1.prismaMigrate)({
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
        const password = await (0, get_db_parameters_1.getDBPassword)(this.name, "local");
        this.dbPassword = password;
        if (PostgresService.process == null) {
            PostgresService.process = await (0, docker_1.startContainer)({
                name: this.name,
                additionalArguments: [
                    "-e",
                    `POSTGRES_PASSWORD=${password}`,
                    "-p",
                    "5432:5432",
                    "-v",
                    `${node_path_1.default.resolve(constants_1.SAWS_DIR, "postgres")}/:/var/lib/postgresql/data`,
                ],
                image: this.imageName,
                check: async () => {
                    const client = new pg_1.Client({
                        user: "postgres",
                        password,
                    });
                    try {
                        await client.connect();
                        await client.end();
                        return true;
                    }
                    catch (err) {
                        await client.end();
                        return false;
                    }
                },
            });
            PostgresService.process.stdout?.pipe(process.stdout);
            PostgresService.process.stderr?.pipe(process.stderr);
        }
        await this.setOutputs({
            postgresHost: "localhost",
            postgresPort: "5432",
            postgresUsername: "postgres",
            postgresDBName: (0, get_db_parameters_1.getDBName)(this.name, "local"),
        }, "local");
    }
    async createDB() {
        const password = this.dbPassword;
        if (password == null)
            return;
        const client = new pg_1.Client({
            user: "postgres",
            password,
        });
        await client.connect();
        const value = await client.query(`SELECT FROM pg_database WHERE datname = '${(0, get_db_parameters_1.getDBName)(this.name, "local")}'`);
        if (value.rows.length > 0)
            return;
        console.log("DB did not exist. Creating and running migrations");
        await client.query(`CREATE DATABASE ${(0, get_db_parameters_1.getDBName)(this.name, "local")}`);
        try {
            await (0, prisma_helpers_1.prismaMigrate)({
                username: String(this.outputs.postgresUsername),
                password,
                endpoint: String(this.outputs.postgresHost),
                dbName: String(this.outputs.postgresDBName),
                port: String(this.outputs.postgresPort),
            });
        }
        catch (err) {
            console.log("error", err);
        }
    }
    exit() {
        PostgresService.process?.kill();
        PostgresService.process = undefined;
    }
    async getEnvironmentVariables(stage) {
        const password = await (0, get_db_parameters_1.getDBPassword)(this.name, stage);
        return {
            [this.parameterizedEnvVarName("POSTGRES_USERNAME")]: String(this.outputs.postgresUsername),
            [this.parameterizedEnvVarName("POSTGRES_PASSWORD")]: password,
            [this.parameterizedEnvVarName("POSTGRES_HOST")]: String(this.outputs.postgresHost),
            [this.parameterizedEnvVarName("POSTGRES_PORT")]: String(this.outputs.postgresPort),
            [this.parameterizedEnvVarName("POSTGRES_DB_NAME")]: String(this.outputs.postgresDBName),
        };
    }
    getStdOut() {
        return PostgresService.process?.stdout;
    }
}
exports.PostgresService = PostgresService;

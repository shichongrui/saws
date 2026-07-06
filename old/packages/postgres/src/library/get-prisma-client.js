"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPrismaClient = void 0;
const client_1 = require("@prisma/client");
const parameterized_env_var_name_1 = require("@saws/utils/parameterized-env-var-name");
const getPrismaClient = (name) => {
    const { [(0, parameterized_env_var_name_1.parameterizedEnvVarName)(name, "POSTGRES_USERNAME")]: username, [(0, parameterized_env_var_name_1.parameterizedEnvVarName)(name, "POSTGRES_HOST")]: host, [(0, parameterized_env_var_name_1.parameterizedEnvVarName)(name, "POSTGRES_PORT")]: port, [(0, parameterized_env_var_name_1.parameterizedEnvVarName)(name, "POSTGRES_DB_NAME")]: dbName, [(0, parameterized_env_var_name_1.parameterizedEnvVarName)(name, "POSTGRES_PASSWORD")]: password, } = process.env;
    const DATABASE_URL = `postgres://${username}:${password}@${host}:${port}/${dbName}?connection_limit=1`;
    return new client_1.PrismaClient({
        datasources: {
            db: {
                url: DATABASE_URL,
            },
        },
    });
};
exports.getPrismaClient = getPrismaClient;

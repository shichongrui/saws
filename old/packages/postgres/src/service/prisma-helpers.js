"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedPrisma = exports.pushPrisma = exports.startPrismaStudio = exports.prismaMigrate = exports.createPrismaMigration = exports.runMigrationsLocally = exports.generatePrismaClient = void 0;
const child_process_1 = require("child_process");
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const generatePrismaClient = () => {
    return new Promise(async (resolve, reject) => {
        // if the schema has no models, this command will fail so we need to check first
        const schemaContents = node_fs_1.default.readFileSync(node_path_1.default.resolve('./prisma/schema.prisma'), 'utf-8');
        if (schemaContents.search(/^model .* {$/) === -1)
            return resolve(null);
        (0, child_process_1.exec)(`npx prisma generate`, async (err) => {
            if (err != null) {
                reject(err);
                return;
            }
            resolve(null);
        });
    });
};
exports.generatePrismaClient = generatePrismaClient;
const runMigrationsLocally = ({ username, password, endpoint, port, dbName, }) => {
    return new Promise(async (resolve, reject) => {
        console.log(`postgres://${username}:${password}@${endpoint}:${port}/${dbName}`);
        (0, child_process_1.exec)(`npx prisma migrate dev`, {
            env: {
                ...process.env,
                DATABASE_URL: `postgres://${username}:${password}@${endpoint}:${port}/${dbName}`,
            },
        }, (err) => {
            if (err != null) {
                return reject(err);
            }
            resolve(null);
        });
    });
};
exports.runMigrationsLocally = runMigrationsLocally;
const createPrismaMigration = ({ name, username, password, endpoint, port, dbName, }) => {
    return new Promise((resolve, reject) => {
        console.log("Creating migration", name);
        console.log(`postgres://${username}:${password}@${endpoint}:${port}/${dbName}`);
        (0, child_process_1.exec)(`npx prisma migrate dev --name ${name}`, {
            env: {
                ...process.env,
                DATABASE_URL: `postgres://${username}:${password}@${endpoint}:${port}/${dbName}`,
            },
        }, (err) => {
            if (err != null) {
                return reject(err);
            }
            resolve(null);
        });
    });
};
exports.createPrismaMigration = createPrismaMigration;
const prismaMigrate = ({ username, password, endpoint, port, dbName, }) => {
    return new Promise((resolve, reject) => {
        (0, child_process_1.exec)("npx prisma migrate deploy", {
            env: {
                ...process.env,
                DATABASE_URL: `postgres://${username}:${password}@${endpoint}:${port}/${dbName}`,
            },
        }, (err) => {
            if (err != null) {
                reject(err);
                return;
            }
            resolve(null);
        });
    });
};
exports.prismaMigrate = prismaMigrate;
const startPrismaStudio = ({ username, password, endpoint, port, dbName, openBrowser = false, }) => {
    return new Promise((resolve, reject) => {
        (0, child_process_1.exec)("npx prisma studio" + (!openBrowser ? " --browser none" : ""), {
            env: {
                ...process.env,
                DATABASE_URL: `postgres://${username}:${password}@${endpoint}:${port}/${dbName}`,
            },
        }, (err) => {
            if (err != null) {
                reject(err);
                return;
            }
            resolve(null);
        });
    });
};
exports.startPrismaStudio = startPrismaStudio;
const pushPrisma = ({ username, password, endpoint, port, dbName, }) => {
    return new Promise((resolve, reject) => {
        (0, child_process_1.exec)("npx prisma migrate reset", {
            env: {
                ...process.env,
                DATABASE_URL: `postgres://${username}:${password}@${endpoint}:${port}/${dbName}`,
            },
        }, (err) => {
            if (err != null) {
                reject(err);
                return;
            }
            resolve(null);
        });
    });
};
exports.pushPrisma = pushPrisma;
const seedPrisma = ({ username, password, endpoint, port, dbName, }) => {
    return new Promise((resolve, reject) => {
        (0, child_process_1.exec)("npx prisma db seed", {
            env: {
                ...process.env,
                DATABASE_URL: `postgres://${username}:${password}@${endpoint}:${port}/${dbName}`,
            },
        }, (err) => {
            if (err != null) {
                reject(err);
                return;
            }
            resolve(null);
        });
    });
};
exports.seedPrisma = seedPrisma;

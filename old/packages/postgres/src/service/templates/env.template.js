"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.envTemplate = void 0;
const envTemplate = ({ dbName, password }) => `# Used only by prisma for CLI commands
DATABASE_URL=postgres://postgres:${password}@localhost:5432/${dbName}`;
exports.envTemplate = envTemplate;

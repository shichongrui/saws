"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.schemaPrismaTemplate = void 0;
const schemaPrismaTemplate = () => `generator client {
  provider = "prisma-client-js"
  binaryTargets = ["native", "rhel-openssl-3.0.x"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
`;
exports.schemaPrismaTemplate = schemaPrismaTemplate;

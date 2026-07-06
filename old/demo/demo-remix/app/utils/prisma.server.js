"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
const get_prisma_client_1 = require("@saws/postgres/get-prisma-client");
exports.prisma = (0, get_prisma_client_1.getPrismaClient)('demo-db');

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const get_prisma_client_1 = require("@saws/postgres/get-prisma-client");
const prisma = (0, get_prisma_client_1.getPrismaClient)("saws-example-db");
const handler = async (event, context) => {
    return { event, context };
};
exports.handler = handler;

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const get_prisma_client_1 = require("@saws/postgres/get-prisma-client");
const main = async () => {
    const prisma = (0, get_prisma_client_1.getPrismaClient)('demo-db');
    await prisma.user.upsert({
        where: {
            id: 2,
        },
        update: {},
        create: {
            id: 2,
            email: 'dev@saws.com',
            cognito_id: '12345',
            first_name: 'Dev',
            last_name: 'User',
            account_id: 1,
        }
    });
};
main().catch(err => console.log(err));

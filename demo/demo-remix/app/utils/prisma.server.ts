import { getPrismaClient } from "@saws/postgres/get-prisma-client";

export const prisma = getPrismaClient('demo-db')

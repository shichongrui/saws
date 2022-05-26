import * as path from "node:path";
import { getPrismaClient } from "@saws/postgres/get-prisma-client";
import type { Handler } from "aws-lambda";
import { promises as fs } from "node:fs"

const prisma = getPrismaClient("saws-example-db");

export const handler: Handler = async (event, context) => {


  return { event, context };
};

import { getPrismaClient } from "../../libraries";
import { Handler } from "../../libraries";

const prisma = getPrismaClient("saws-example-db");

export const handler: Handler = async (event) => {
  const users = await prisma.user.findMany();
  return { worked: true, users, event };
};

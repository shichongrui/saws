import { getPrismaClient } from "../../libraries";

const prisma = getPrismaClient("saws-example-db");

export const handler = async (event: any) => {
  const users = await prisma.user.findMany();
  return { worked: true, users, event };
};

import path from "node:path";
import { getPrismaClient } from "../../libraries";
import { Handler } from "../../libraries";
import { promises as fs } from "node:fs"

const prisma = getPrismaClient("saws-example-db");

export const handler: Handler = async (event) => {
  const users = await prisma.user.findMany();

  const file = await fs.readFile(path.resolve(__dirname, './resources/file.json'), 'utf-8')
  const contents = JSON.parse(file)

  return { worked: true, users, event, contents };
};

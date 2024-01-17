import path from "node:path";
// import { getPrismaClient } from "../../libraries";
import type { Handler } from "aws-lambda";
import { promises as fs } from "node:fs"

// const prisma = getPrismaClient("saws-example-db");

export const handler: Handler = async (event) => {
  // const users = await prisma.user.findMany();

  const file = await fs.readFile(path.resolve(__dirname, './resources/file.json'), 'utf-8')
  const contents = JSON.parse(file)

  await new Promise(r => setTimeout(r, 3000))
  console.log('executed')

  return { worked: true, event, contents };
};

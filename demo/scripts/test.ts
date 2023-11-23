import { getPrismaClient } from "../../libraries";

(async () => {
  const prisma = getPrismaClient('saws-example-db')

  const users = await prisma.user.findMany()

  console.log(users)
})()
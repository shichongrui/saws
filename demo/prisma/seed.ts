import { getPrismaClient } from "@shichongrui/saws-postgres/get-prisma-client";

const main = async () => {
  const prisma = getPrismaClient('demo-db');

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
  })
}

main().catch(err => console.log(err))
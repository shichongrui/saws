import { getPrismaClient } from "../../libraries";

const main = async () => {
  const prisma = getPrismaClient('saws-example-db');

  await prisma.user.upsert({
    where: {
      email: 'dev@saws.com',
    },
    update: {},
    create: {
      email: 'dev@saws.com',
      cognito_id: '12345',
      first_name: 'Dev',
      last_name: 'User',
      account_id: 1,
      created_by_user_id: 1,
      updated_by_user_id: 1,
    }
  })
}

main().catch(err => console.log(err))
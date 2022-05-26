import { LoaderFunctionArgs, json } from "@remix-run/node";
import { prisma } from "../utils/prisma.server";
import { Link, useLoaderData, useRevalidator } from "@remix-run/react";
import { getSession } from "../utils/session.server";
import { User } from "@prisma/client";
import { Button } from "@chakra-ui/react";
import { sessionClient } from "../utils/session.client";
import { secrets } from "../utils/secrets.server";
import { functionsClient } from "../utils/functions.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const session = await getSession("demo-cognito", request);

  const secret = await secrets.get('super-secret')

  let user: User | null = null
  if (session != null) {
    user = await prisma.user.upsert({
      where: {
        id: 1,
      },
      update: {},
      create: {
        id: 1,
        cognito_id: session.sub ?? '',
        email: "email@email.com",
        first_name: "First",
        last_name: "Last",
        account_id: 1234,
      },
    });
  }

  const response = await functionsClient.call('demo-typescript-function', {
    call: 'me'
  })

  return json({
    user,
    secret,
    functionResponse: response,
  });
};

export default () => {
  const data = useLoaderData<typeof loader>();
  const { revalidate } = useRevalidator();
  return (
    <div>
      <p>Hello world!</p>
      <h3>Current User:</h3>
      <pre>{JSON.stringify(data.user, null, 2)}</pre>
      {data.user != null ? <Button onClick={() => {
        sessionClient.signOut()
        revalidate()
      }}>Log out</Button> : <Link to='/auth'>Sign In</Link>}
      <p>{data.secret}</p>
      <p>{JSON.stringify(data.functionResponse)}</p>
    </div>
  );
};

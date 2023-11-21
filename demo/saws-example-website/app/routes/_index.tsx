import * as React from "react";
import { json } from "@remix-run/node";
import { prisma } from "../utils/prisma.server";
import { useLoaderData } from '@remix-run/react';
import { functionsClient } from '../utils/functions.server';
import { files } from '../utils/file-storage.server';

export const loader = async () => {
  const users = await prisma.user.findMany();

  const result = await functionsClient.call<{ event: { test: boolean } }>('saws-example-function', {
    test: true,
  })

  const fileUrl = await files.getFileUrl('/1.png')

  return json({
    users,
    result,
    fileUrl,
  });
};

export default () => {
  const data = useLoaderData<typeof loader>()
  console.log(data)
  return (
    <div>
      <p>Hello world!</p>
      <p>{String(data.result?.event.test)}</p>
      <ul>
        {data.users.map(user => (
          <li key={user.id}>{user.first_name} {user.last_name}</li>
        ))}
      </ul>
      <img src={data.fileUrl} />
    </div>
  );
};

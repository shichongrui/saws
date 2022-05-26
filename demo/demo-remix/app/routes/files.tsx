import { ActionFunctionArgs, LoaderFunctionArgs, json } from "@remix-run/node";
import { files } from "../utils/file-storage.server";
import { Form, useLoaderData } from "@remix-run/react";
import { Button } from "@chakra-ui/react";
import { multipartFormData } from '../utils/multipartFormData.server'
import path from "path";
import fs from 'node:fs';

export const loader = async () => {
  const allFiles = await files.listFiles("");

  return json({ files: allFiles });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await multipartFormData(request)

  const filePath = formData.get('file')?.toString()

  if (filePath == null) throw new Response('Missing file', { status: 400 })

  const parsed = path.parse(filePath)
  await files.writeFile(parsed.base, fs.readFileSync(filePath))

  return json({ uploaded: true })
}

export default () => {
  const data = useLoaderData<typeof loader>();

  return (
    <div>
      <Form method='post' encType="multipart/form-data">
        <label>
          Upload File
          <input type='file' name='file' />
        </label>
        <Button type='submit'>Upload</Button>
      </Form>
      <ul>
        {data.files?.map((file) => (
          <li>{file.Key}</li>
        ))}
      </ul>
    </div>
  );
};

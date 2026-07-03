import {
  Button,
  Container,
  FormControl,
  FormLabel,
  Heading,
  Input,
  Textarea
} from "@chakra-ui/react";
import { ActionFunctionArgs, json } from "@remix-run/node";
import { Form } from "@remix-run/react";
import { email } from "../utils/email.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData()

  const from = String(formData.get('from'))
  const to = String(formData.get('to'))
  const subject = String(formData.get('subject'))
  const body = String(formData.get('body'))

  await email.sendEmail({
    to: [to],
    subject,
    type: "html",
    message: body,
    source: from
  })

  return json({ sent: true })
}

export default () => {
  return (
    <Container>
      <Heading>Send Email</Heading>
      <Form method="post">
        <FormControl>
          <FormLabel>From:</FormLabel>
          <Input name="from" />
        </FormControl>
        <FormControl>
          <FormLabel>To:</FormLabel>
          <Input name="to" />
        </FormControl>
        <FormControl>
          <FormLabel>Subject:</FormLabel>
          <Input name="subject" />
        </FormControl>
        <FormControl>
          <FormLabel>Body</FormLabel>
          <Textarea name="body" />
        </FormControl>
        <Button type="submit">Send</Button>
      </Form>
    </Container>
  );
};

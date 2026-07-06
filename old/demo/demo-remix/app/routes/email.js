"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.action = void 0;
const react_1 = require("@chakra-ui/react");
const node_1 = require("@remix-run/node");
const react_2 = require("@remix-run/react");
const email_server_1 = require("../utils/email.server");
const action = async ({ request }) => {
    const formData = await request.formData();
    const from = String(formData.get('from'));
    const to = String(formData.get('to'));
    const subject = String(formData.get('subject'));
    const body = String(formData.get('body'));
    await email_server_1.email.sendEmail({
        to: [to],
        subject,
        type: "html",
        message: body,
        source: from
    });
    return (0, node_1.json)({ sent: true });
};
exports.action = action;
exports.default = () => {
    return (<react_1.Container>
      <react_1.Heading>Send Email</react_1.Heading>
      <react_2.Form method="post">
        <react_1.FormControl>
          <react_1.FormLabel>From:</react_1.FormLabel>
          <react_1.Input name="from"/>
        </react_1.FormControl>
        <react_1.FormControl>
          <react_1.FormLabel>To:</react_1.FormLabel>
          <react_1.Input name="to"/>
        </react_1.FormControl>
        <react_1.FormControl>
          <react_1.FormLabel>Subject:</react_1.FormLabel>
          <react_1.Input name="subject"/>
        </react_1.FormControl>
        <react_1.FormControl>
          <react_1.FormLabel>Body</react_1.FormLabel>
          <react_1.Textarea name="body"/>
        </react_1.FormControl>
        <react_1.Button type="submit">Send</react_1.Button>
      </react_2.Form>
    </react_1.Container>);
};

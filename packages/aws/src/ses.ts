import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

export class SES {
  client: SESClient;

  constructor() {
    this.client = new SESClient({});
  }

  async sendEmail({
    to,
    subject,
    type,
    message,
    source,
  }: {
    to: string[];
    subject: string;
    type: "html" | "text";
    message: string;
    source: string;
  }) {
    const body =
      type === "html"
        ? {
            Html: {
              Data: message,
            },
          }
        : {
            Text: {
              Data: message,
            },
          };
    const command = new SendEmailCommand({
      Destination: {
        ToAddresses: to,
      },
      Message: {
        Subject: {
          Data: subject,
        },
        Body: body,
      },
      Source: source,
    });

    await this.client.send(command);
  }
}

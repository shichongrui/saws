import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

export class SES {
  client: SESClient;

  constructor() {
    this.client = new SESClient({});
  }

  async sendEmail(
    emails: string[],
    subject: string,
    message: string,
    source: string
  ) {
    const command = new SendEmailCommand({
      Destination: {
        ToAddresses: emails,
      },
      Message: {
        Subject: {
          Data: subject,
        },
        Body: {
          Text: {
            Data: message,
          },
        },
      },
      Source: source,
    });

    await this.client.send(command);
  }
}

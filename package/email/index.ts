import {
  SESClient,
  SendEmailCommandInput,
  SendEmailCommand,
} from "@aws-sdk/client-ses";

export interface EmailInterface {
  sendEmail(emails: string[], subject: string, message: string): Promise<void>;
}

export class SESEmail implements EmailInterface {
  client: SESClient

  constructor() {
    this.client = new SESClient({})
  }

  async sendEmail(emails: string[], subject: string, message: string) {
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
      Source: 'tech.admin@youyan.io'
    });

    await this.client.send(command)
  }
}

import {
  TranslateClient,
  TranslateTextCommand,
} from "@aws-sdk/client-translate";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

type EmailConfig = {
  to: string[];
  subject: string;
  body: string;
};

export interface EmailInterface {
  sendEmail(config: EmailConfig): Promise<unknown>;
}

export class LocalEmail implements EmailInterface {
  async sendEmail({ to, subject, body }: EmailConfig) {
    console.log("Sending Email");
    console.log("To:", to);
    console.log("Subject:", subject);
    console.log("Body:", body);
  }
}

export class SesEmail {
  client: SESClient;

  constructor(public source: string) {
    this.client = new SESClient({});
  }

  async sendEmail({ to, subject, body }: EmailConfig) {
    const command = new SendEmailCommand({
      Destination: {
        ToAddresses: to,
      },
      Message: {
        Subject: {
          Data: subject,
        },
        Body: {
          Html: {
            Data: body,
          },
        },
      },
      Source: this.source,
    });

    const response = await this.client.send(command);
    return response;
  }
}

export class Email implements EmailInterface {
  manager: EmailInterface;

  constructor(stage: string, source: string) {
    this.manager = stage === "local" ? new LocalEmail() : new SesEmail(source);
  }

  sendEmail(config: EmailConfig) {
    return this.manager.sendEmail(config);
  }
}

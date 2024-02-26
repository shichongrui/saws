import { SES } from "@shichongrui/saws-aws/ses";

type EmailConfig = {
  to: string[];
  subject: string;
  type: "html" | "text";
  message: string;
  source: string;
};

export interface EmailInterface {
  sendEmail(config: EmailConfig): Promise<unknown>;
}

export class LocalEmail implements EmailInterface {
  async sendEmail({ to, subject, message }: EmailConfig) {
    console.log("Sending Email");
    console.log("To:", to);
    console.log("Subject:", subject);
    console.log("Body:", message);
  }
}

export class SesEmail {
  client: SES;

  constructor() {
    this.client = new SES();
  }

  async sendEmail({ to, subject, message, type, source }: EmailConfig) {
    const response = await this.client.sendEmail({
      to,
      subject,
      type,
      message,
      source,
    });
    return response;
  }
}

export class Email implements EmailInterface {
  manager: EmailInterface;

  constructor(stage: string = String(process.env.STAGE)) {
    this.manager = stage === "local" ? new LocalEmail() : new SesEmail();
  }

  sendEmail(config: EmailConfig) {
    return this.manager.sendEmail(config);
  }
}

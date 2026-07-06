"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SES = void 0;
const client_ses_1 = require("@aws-sdk/client-ses");
class SES {
    client;
    constructor() {
        this.client = new client_ses_1.SESClient({});
    }
    async sendEmail({ to, subject, type, message, source, }) {
        const body = type === "html"
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
        const command = new client_ses_1.SendEmailCommand({
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
exports.SES = SES;

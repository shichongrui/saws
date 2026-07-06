"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Email = exports.SesEmail = exports.LocalEmail = void 0;
const ses_1 = require("@saws/aws/ses");
class LocalEmail {
    async sendEmail({ to, subject, message }) {
        console.log("Sending Email");
        console.log("To:", to);
        console.log("Subject:", subject);
        console.log("Body:", message);
    }
}
exports.LocalEmail = LocalEmail;
class SesEmail {
    client;
    constructor() {
        this.client = new ses_1.SES();
    }
    async sendEmail({ to, subject, message, type, source }) {
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
exports.SesEmail = SesEmail;
class Email {
    manager;
    constructor(stage = String(process.env.STAGE)) {
        this.manager = stage === "local" ? new LocalEmail() : new SesEmail();
    }
    sendEmail(config) {
        return this.manager.sendEmail(config);
    }
}
exports.Email = Email;

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailService = void 0;
const core_1 = require("@saws/core");
class EmailService extends core_1.ServiceDefinition {
    getPermissions() {
        return [
            {
                Effect: "Allow",
                Action: ["ses:SendEmail", "ses:SendRawEmail"],
                Resource: "*",
            },
        ];
    }
}
exports.EmailService = EmailService;

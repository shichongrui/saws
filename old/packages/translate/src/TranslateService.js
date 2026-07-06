"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TranslateService = void 0;
const core_1 = require("@saws/core");
class TranslateService extends core_1.ServiceDefinition {
    getPermissions() {
        return [
            {
                Effect: "Allow",
                Action: ["translate:TranslateText"],
                Resource: "*",
            },
        ];
    }
}
exports.TranslateService = TranslateService;

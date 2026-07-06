"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Translate = void 0;
const client_translate_1 = require("@aws-sdk/client-translate");
class Translate {
    client;
    constructor() {
        this.client = new client_translate_1.TranslateClient({});
    }
    async translateText(text, sourceLanguage, targetLanguage) {
        const command = new client_translate_1.TranslateTextCommand({
            Text: text,
            SourceLanguageCode: sourceLanguage,
            TargetLanguageCode: targetLanguage,
        });
        const response = await this.client.send(command);
        return response.TranslatedText;
    }
}
exports.Translate = Translate;

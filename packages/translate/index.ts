import { TranslateClient, TranslateTextCommand  } from '@aws-sdk/client-translate'

export class Translate {
  client: TranslateClient

  constructor() {
    this.client = new TranslateClient({})
  }

  async translateText(text: string, sourceLanguage: string, targetLanguage: string) {
    const command = new TranslateTextCommand({
      Text: text,
      SourceLanguageCode: sourceLanguage,
      TargetLanguageCode: targetLanguage,
    })

    const response = await this.client.send(command)
    return response.TranslatedText
  }
}
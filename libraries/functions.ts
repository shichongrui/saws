import { LambdaClient, InvokeCommand, LambdaClientConfig } from "@aws-sdk/client-lambda";

export class FunctionsClient {
  client: LambdaClient;
  stage: string;

  constructor(stage: string = String(process.env.STAGE)) {
    const config: LambdaClientConfig = {}
    if (stage === 'local') {
      config.endpoint = 'http://localhost:9000'
      config.credentials = {
        accessKeyId: 'local-lambda',
        secretAccessKey: 'local-lambda',
      }
    }

    this.client = new LambdaClient(config);
    this.stage = stage;
  }

  async call<T extends any>(
    name: string,
    payload: any,
    config: { async: boolean } = { async: false }
  ): Promise<T> {
    const command = new InvokeCommand({
      FunctionName: `${this.stage}-${name}`,
      InvocationType: config.async ? "Event" : "RequestResponse",
      Payload: Buffer.from(JSON.stringify(payload)),
    });

    const response = await this.client.send(command);
    const responseText = new TextDecoder().decode(response.Payload);
    try {
      return JSON.parse(responseText) as T;
    } catch (_) {
      return responseText as T;
    }
  }
}

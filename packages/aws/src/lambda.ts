import { LambdaClient, InvokeCommand, LambdaClientConfig } from "@aws-sdk/client-lambda";

export class Lambda {
  client: LambdaClient;
  stage: string;

  constructor(stage: string) {
    const config: LambdaClientConfig = {}
    if (stage === 'local') {
      config.endpoint = 'http://localhost:9000'
      config.credentials = {
        accessKeyId: 'local-lambda',
        secretAccessKey: 'local-lambda',
      }
      config.region = 'us-west-2'
    }

    this.client = new LambdaClient(config);
    this.stage = stage;
  }

  async invoke<T extends any>(
    name: string,
    payload: any,
    config: { async: boolean } = { async: false },
    context: any = ''
  ): Promise<T> {
    const command = new InvokeCommand({
      FunctionName: `${this.stage}-${name}`,
      InvocationType: config.async ? "Event" : "RequestResponse",
      Payload: Buffer.from(JSON.stringify(payload)),
      ClientContext: Buffer.from(JSON.stringify(context)).toString('base64'),
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

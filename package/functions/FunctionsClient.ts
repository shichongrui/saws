import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

export default class FunctionsClient {

  client: LambdaClient
  stage: string

  constructor(stage: string) {
    this.client = new LambdaClient({
      endpoint: stage === 'local' ? 'http://localhost:9000' : undefined,
    });
    this.stage = stage;
  }

  async call(name: string, payload: string, config: { async: boolean } = { async: false }): Promise<string> {
    const command = new InvokeCommand({
      FunctionName: `${process.env.PROJECT_NAME}-${this.stage}-${name}`,
      InvocationType: config.async ? 'Event' : 'RequestResponse',
      Payload: Buffer.from(JSON.stringify(payload)),
    });
    
    const response = await this.client.send(command);
    return JSON.parse(new TextDecoder().decode(response.Payload));
  }
}
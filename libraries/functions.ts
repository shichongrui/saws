import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

export class FunctionsClient {
  client: LambdaClient;
  stage: string;

  constructor(stage: string = String(process.env.STAGE)) {
    this.client = new LambdaClient({
      endpoint: stage === "local" ? "http://localhost:9000" : undefined,
    });
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

import { Lambda } from '@shichongrui/saws-aws/lambda'

export class FunctionsClient {
  client: Lambda;
  stage: string;

  constructor(stage: string = String(process.env.STAGE)) {
    this.client = new Lambda(stage);
    this.stage = stage;
  }

  async call<T extends any>(
    name: string,
    payload: any,
    config: { async: boolean } = { async: false }
  ): Promise<T> {
    return this.client.invoke<T>(name, payload, config)
  }
}

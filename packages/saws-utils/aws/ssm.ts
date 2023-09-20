import {
  GetParameterCommand,
  ParameterType,
  PutParameterCommand,
  SSMClient,
} from "@aws-sdk/client-ssm";

export class SSM {
  client: SSMClient;

  constructor() {
    this.client = new SSMClient({});
  }
  
  async getParameter(name: string, decrypt: boolean = false) {
    const command = new GetParameterCommand({
      Name: name,
      WithDecryption: decrypt,
    });
    const results = await this.client.send(command);
    return results.Parameter?.Value ?? "";
  };
  
  async putParameter(
    name: string,
    value: string,
    encrypt: boolean = false
  ) {
    const command = new PutParameterCommand({
      Name: name,
      Value: value,
      Type: encrypt ? ParameterType.SECURE_STRING : ParameterType.STRING,
    });
    await this.client.send(command);
  };
}


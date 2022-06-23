import {
  GetParameterCommand,
  ParameterType,
  PutParameterCommand,
  SSMClient,
} from "@aws-sdk/client-ssm";

const client = new SSMClient({});

export const getParameter = async (name: string, decrypt: boolean = false) => {
  const command = new GetParameterCommand({
    Name: name,
    WithDecryption: decrypt,
  });
  const results = await client.send(command);
  return results.Parameter?.Value ?? "";
};

export const putParameter = async (
  name: string,
  value: string,
  encrypt: boolean = false
) => {
  const command = new PutParameterCommand({
    Name: name,
    Value: value,
    Type: encrypt ? ParameterType.SECURE_STRING : ParameterType.STRING,
  });
  await client.send(command);
};

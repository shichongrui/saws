import prompt from "prompt";
import SecretsManager from "../../secrets";

export async function secret(stage: string = "local") {
  prompt.start();

  prompt.message = "";
  prompt.delimiter = "";

  const { name, value } = await prompt.get({
    properties: {
      name: {
        description: "Secret name",
        required: true,
      },
      value: {
        description: "Secret",
        // @ts-ignore
        hidden: true,
        replace: "*",
        required: true,
      },
    },
  });

  const secretsManager = new SecretsManager(stage);
  await secretsManager.set(name.toString(), value.toString());
}
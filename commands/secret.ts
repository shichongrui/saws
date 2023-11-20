import prompt from "prompt";
import { SecretsManager } from "../libraries/secrets";

export async function secret(
  stage: string = "local",
  getOrSet: string,
  name: string
) {
  const secretsManager = new SecretsManager(stage)

  if (getOrSet === "set") {
    prompt.start();

    prompt.message = "";
    prompt.delimiter = "";

    const { value } = await prompt.get({
      properties: {
        value: {
          description: "Secret",
          hidden: true,
          // @ts-expect-error
          replace: "*",
          required: true,
        },
      },
    });

    await secretsManager.set(name, value.toString());
  } else {
    const value = await secretsManager.get(name);
    console.log(value);
  }
}
import prompt from "prompt";
import SecretsManager from "@shichongrui/saws-secrets";

export async function secret(stage: string = "local", getOrSet: string, name: string) {
  if (getOrSet === 'set') {
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
  
    await SecretsManager.set(name, value.toString());
  } else {
    const value = await SecretsManager.get(name);
    console.log(value);
  }
}

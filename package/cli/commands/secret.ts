import prompt from "prompt";
import SecretsManager from "../../secrets";

export async function secrets(stage: string = "local", getOrSet: string, name: string) {
  const secretsManager = new SecretsManager(stage);

  if (getOrSet === 'set') {
    prompt.start();
  
    prompt.message = "";
    prompt.delimiter = "";
  
    const { value } = await prompt.get({
      properties: {
        value: {
          description: "Secret",
          // @ts-ignore
          hidden: true,
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

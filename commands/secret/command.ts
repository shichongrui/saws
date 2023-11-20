import { SecretsManager } from "../../libraries/secrets"

export const secretCommand = async (name: string, { stage, set, get }: { stage: string, set: string, get: boolean }) => {
  const secretsManager = new SecretsManager(stage)

  if (get) {
    const secret = await secretsManager.get(name)
    console.log(secret)
  } else {
    await secretsManager.set(name, set)
    console.log('Set secret')
  }
}
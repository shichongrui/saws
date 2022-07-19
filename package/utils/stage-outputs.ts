import { promises as fs } from "fs";
import path from "path";
import { SAWS_DIR } from "./constants";

export type Outputs = {
  postgresHost: string;
  postgresPort: string;
  postgresDBName: string;
  postgresUsername: string;
  graphqlEndpoint: string;
  userPoolName: string;
  userPoolId: string;
  userPoolClientName: string;
  userPoolClientId: string;
  devUserEmail?: string;
};

export const getStageOutputs = async (stage: string): Promise<Outputs> => {
  const outputPath = path.resolve(SAWS_DIR, `saws-api-${stage}-output.json`);
  try {
    await fs.stat(outputPath);
    const outputsText = await fs.readFile(outputPath, { encoding: "utf-8" });
    return JSON.parse(outputsText);
  } catch (err) {
    return {
      postgresDBName: "",
      postgresHost: "",
      postgresPort: "",
      postgresUsername: "",
      graphqlEndpoint: "",
      userPoolName: "",
      userPoolId: "",
      userPoolClientName: "",
      userPoolClientId: "",
    };
  }
};

export const writeStageOutputs = async (
  newOutputs: Partial<Outputs>,
  stage: string
) => {
  const currentOutputs = await getStageOutputs(stage);

  // write outputs
  const outputs: Outputs = {
    ...currentOutputs,
    ...newOutputs,
  };
  await fs.writeFile(
    path.resolve(SAWS_DIR, `saws-api-${stage}-output.json`),
    JSON.stringify(outputs, null, 2)
  );

  return outputs;
};

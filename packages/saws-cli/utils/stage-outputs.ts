import { promises as fs } from "fs";
import path from "path";
import { Outputs } from "../modules/ModuleDefinition";
import { SAWS_DIR } from "@shichongrui/saws-core";


export const getStageOutputs = async (stage: string): Promise<Record<string, Outputs>> => {
  const outputPath = path.resolve(SAWS_DIR, `saws-api-${stage}-output.json`);
  try {
    await fs.stat(outputPath);
    const outputsText = await fs.readFile(outputPath, { encoding: "utf-8" });
    return JSON.parse(outputsText);
  } catch (err) {
    return {};
  }
};

export const writeStageOutputs = async (
  newOutputs: Record<string, Outputs>,
  stage: string
) => {
  const currentOutputs = await getStageOutputs(stage);

  // write outputs
  const outputs: Record<string, Outputs> = {
    ...currentOutputs,
    ...newOutputs,
  };
  await fs.writeFile(
    path.resolve(SAWS_DIR, `saws-api-${stage}-output.json`),
    JSON.stringify(outputs, null, 2)
  );

  return outputs;
};

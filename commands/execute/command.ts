import path from "path";
import { getSawsConfig } from "../../utils/get-saws-config";
import { getStageOutputs } from "../../utils/stage-outputs";
import esbuild from "esbuild";
import { BUILD_DIR, SAWS_DIR } from "../../utils/constants";

export const executeCommand = async (
  sawsPath: string,
  scriptPath: string,
  { stage = "local" }: { stage: string }
) => {
  process.env.STAGE = stage;
  process.env.NODE_ENV = stage === "local" ? "development" : "production";

  const serviceDefinition = await getSawsConfig(sawsPath);

  const stageOutputs = await getStageOutputs(stage);

  await serviceDefinition.forEachDependencyAsync(async (dependency) => {
    await dependency.setOutputs(
      {
        ...stageOutputs[dependency.name],
      },
      stage
    );
    process.env = {
      ...process.env,
      ...(await dependency.getEnvironmentVariables()),
    };
  });

  await serviceDefinition.setOutputs(
    {
      ...stageOutputs[serviceDefinition.name],
    },
    stage
  );

  process.env = {
    ...process.env,
    ...(await serviceDefinition.getEnvironmentVariables()),
  };

  const outFile = path.join(BUILD_DIR, "script.js");

  await esbuild.build({
    entryPoints: [scriptPath],
    bundle: true,
    outfile: outFile,
    platform: "node",
  });

  await import(outFile)
};

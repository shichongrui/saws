import { getSawsConfig } from "@saws/core";
import { BUILD_DIR } from "@saws/utils/constants";
import { getStageOutputs } from "@saws/utils/stage-outputs";
import { fork } from "child_process";
import esbuild from "esbuild";
import path from "path";

export const executeCommand = async (
  scriptPath: string,
  sawsPath: string,
  { stage = "local" }: { stage: string }
) => {
  process.env.STAGE = stage;

  const serviceDefinition = await getSawsConfig(sawsPath);

  const stageOutputs = await getStageOutputs(stage);
  const services = serviceDefinition.getAllDependencies()
  let environment: Record<string, string> = {
    NODE_ENV: stage === "local" ? "development" : "production",
    STAGE: stage,
  }
  for (const service of services) {
    await service.setOutputs(stageOutputs[service.name], stage)
    environment = {
      ...environment,
      ...await(service.getEnvironmentVariables(stage))
    }
  }

  const outFile = path.join(BUILD_DIR, "script.js");

  await esbuild.build({
    entryPoints: [scriptPath],
    bundle: true,
    outfile: outFile,
    platform: "node",
  });

  fork(outFile, {
    env: environment,
  })
};

import { dockerCommand } from "docker-cli-js";
import path from "path";
import getPort from "get-port";
import { ApiConfig, FunctionConfig } from "../config";
import { Outputs } from "../utils/stage-outputs";
import { startDevServer } from "./dev-server";
import { startWatcher } from "./watcher";
import { onProcessExit } from "./on-exit";

export async function startAPIModule(
  config: ApiConfig,
  accessToken: string,
  outputs: Outputs
) {
  let handlerRef = { current: undefined };
  await startWatcher(path.join(config.rootDir!, "index.ts"), handlerRef);
  await startDevServer(handlerRef, outputs.userPoolId, accessToken);
  return handlerRef;
}

export async function startFunctionModule(config: FunctionConfig) {
  console.log(`Building ${config.name}`);
  await dockerCommand(`build -t ${config.name} .`, {
    currentWorkingDirectory: path.resolve(config.rootDir ?? ""),
  });

  const port = await getPort({ port: config.port });
  config.port = port;

  console.log(`Starting ${config.name}`);
  await dockerCommand(
    `run -it --rm --name ${config.name} -p ${port}:8080 -d ${config.name}`,
    { echo: false }
  );

  onProcessExit(() => dockerCommand(`stop ${config.name}`, { echo: false }));
}

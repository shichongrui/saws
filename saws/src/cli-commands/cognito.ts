import path from "path";
import { dockerCommand } from "docker-cli-js";
import { SAWS_DIR } from "../utils/constants";
import { retryUntil } from "../utils/retry-until";
import { listUserPools } from "../aws/cognito";

export const startCognitoLocal = async () => {
  console.log("Starting cognito...");

  await dockerCommand(
    `run -it --rm --name saws-cognito -p 9229:9229 -d -v ${path.resolve(
      SAWS_DIR,
      "cognito"
    )}/:/app/.cognito jagregory/cognito-local:latest`,
    { echo: false }
  );

  await retryUntil(async () => {
    try {
      await listUserPools();
      return true;
    } catch (err) {
      return false;
    }
  }, 1000);

  process.on("exit", () => {
    dockerCommand("stop saws-cognito", { echo: false });
  });
  process.on("SIGINT", () => {
    dockerCommand("stop saws-cognito", { echo: false });
  });

  return {
    cognitoEndpoint: "http://localhost:9229",
  };
};

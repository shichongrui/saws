import path from "path";
import { dockerCommand } from "docker-cli-js";
import { SAWS_DIR } from "../../utils/constants";
import retryUntil from "../../utils/retry-until";
import { Cognito } from "../../aws/cognito";
import { onProcessExit } from "../on-exit";

export const startCognitoLocal = async () => {
  console.log("Starting cognito...");

  await dockerCommand(
    `run -it --rm --name saws-cognito -p 9229:9229 -d -v ${path.resolve(
      SAWS_DIR,
      "cognito"
    )}/:/app/.cognito jagregory/cognito-local:latest`,
    { echo: false }
  );

  onProcessExit(() => {
    dockerCommand("stop saws-cognito", { echo: false });
  });

  await retryUntil(async () => {
    try {
      await new Cognito('local').listUserPools();
      return true;
    } catch (err) {
      return false;
    }
  }, 1000);

  return {
    cognitoEndpoint: "http://localhost:9229",
  };
};

import path from "path";
import { SAWS_DIR } from "../../utils/constants";
import { Cognito } from "../../aws/cognito";
import { startContainer } from "./docker";

export const startCognitoLocal = async () => {
  console.log("Starting cognito...");

  await startContainer({
    name: "saws-cognito",
    image: "jagregory/cognito-local:latest",
    additionalArguments: [
      "-p",
      "9229:9229",
      "-v",
      `${path.resolve(SAWS_DIR, "cognito")}/:/app/.cognito`,
    ],
    check: async () => {
      try {
        await new Cognito("local").listUserPools();
        return true;
      } catch (err) {
        return false;
      }
    },
  });

  return {
    cognitoEndpoint: "http://localhost:9229",
  };
};

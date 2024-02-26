import type { JavascriptFunctionMessage } from "./javascript-function-message-types";
import * as path from "node:path";

let handlerRef: any = null;

const captureHandlerRef = (modulePath: string) => {
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(modulePath)) {
      delete require.cache[key];
    }
  }
  handlerRef = require(modulePath).handler;
};

process.on("message", async (message: JavascriptFunctionMessage) => {
  switch (message.type) {
    case "load-function":
      try {
        captureHandlerRef(message.path);
        process.send?.({
          type: "ready",
        });
      } catch (err) {
        process.send?.({
          type: "load-failed",
          error: (err as Error).message,
        });
        process.exit();
      }
      break;
    case "invoke":
      try {
        const result = await handlerRef(message.event, message.context);
        process.send?.({
          type: "response",
          response: result,
        });
      } catch (err) {
        process.send?.({
          type: "error",
          error: (err as Error).message,
        });
      }
      break;
    default:
    // no op
  }
});

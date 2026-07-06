"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
let handlerRef = null;
const captureHandlerRef = (modulePath) => {
    for (const key of Object.keys(require.cache)) {
        if (key.startsWith(modulePath)) {
            delete require.cache[key];
        }
    }
    handlerRef = require(modulePath).handler;
};
process.on("message", async (message) => {
    switch (message.type) {
        case "load-function":
            try {
                captureHandlerRef(message.path);
                process.send?.({
                    type: "ready",
                });
            }
            catch (err) {
                process.send?.({
                    type: "load-failed",
                    error: err.message,
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
                    id: message.id,
                });
            }
            catch (err) {
                process.send?.({
                    type: "error",
                    error: err.message,
                    id: message.id,
                });
            }
            break;
        default:
        // no op
    }
});

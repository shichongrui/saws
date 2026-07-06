"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.API = void 0;
const jsonwebtoken_1 = require("jsonwebtoken");
class API {
    user;
    token;
    logEvent(event) {
        const { headers: _headers, multiValueHeaders: _multiValueHeaders, requestContext: _requestContext, ...loggableEvent } = event;
        console.log("Received request", JSON.stringify({
            ...loggableEvent,
            body: (() => {
                try {
                    return JSON.parse(event.body ?? "");
                }
                catch (_) {
                    return event.body ?? "";
                }
            })(),
            userId: this.user?.userId,
        }, null, 2));
    }
    authenticateRequest(event) {
        this.token = event.headers.authorization ?? event.headers.Authorization;
        this.token = this.token?.replace("Bearer ", "") ?? "";
        if (this.token != null) {
            const payload = (0, jsonwebtoken_1.decode)(this.token);
            this.user = {
                userId: payload?.sub,
                // @ts-expect-error
                username: payload?.username,
            };
        }
    }
}
exports.API = API;

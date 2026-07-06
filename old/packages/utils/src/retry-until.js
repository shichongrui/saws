"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.retryUntil = void 0;
const retryUntil = async (callback, timeout) => {
    while (true) {
        const done = await callback();
        if (done)
            break;
        await new Promise((r) => setTimeout(r, timeout));
    }
    return;
};
exports.retryUntil = retryUntil;

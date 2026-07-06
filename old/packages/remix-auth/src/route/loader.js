"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLoader = void 0;
const node_1 = require("@remix-run/node");
const session_1 = require("../session");
const getLoader = (name, defaultRedirect = '/') => async ({ request }) => {
    const session = await (0, session_1.getSession)(name, request);
    if (session != null) {
        const url = new URL(request.url);
        let redirectTo = url.searchParams.get("redirect") ?? defaultRedirect;
        return (0, node_1.redirect)(redirectTo);
    }
    return null;
};
exports.getLoader = getLoader;

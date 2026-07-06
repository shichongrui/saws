"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = handleRequest;
const server_1 = require("react-dom/server");
const react_1 = require("@remix-run/react");
const react_2 = require("@emotion/react");
const create_instance_1 = __importDefault(require("@emotion/server/create-instance"));
const context_1 = require("./utils/context");
const create_emotion_cache_1 = __importDefault(require("./utils/create-emotion-cache"));
function handleRequest(request, responseStatusCode, responseHeaders, remixContext) {
    const cache = (0, create_emotion_cache_1.default)();
    const { extractCriticalToChunks } = (0, create_instance_1.default)(cache);
    const html = (0, server_1.renderToString)(<context_1.ServerStyleContext.Provider value={null}>
      <react_2.CacheProvider value={cache}>
        <react_1.RemixServer context={remixContext} url={request.url}/>
      </react_2.CacheProvider>
    </context_1.ServerStyleContext.Provider>);
    const chunks = extractCriticalToChunks(html);
    const markup = (0, server_1.renderToString)(<context_1.ServerStyleContext.Provider value={chunks.styles}>
      <react_2.CacheProvider value={cache}>
        <react_1.RemixServer context={remixContext} url={request.url}/>
      </react_2.CacheProvider>
    </context_1.ServerStyleContext.Provider>);
    responseHeaders.set('Content-Type', 'text/html');
    return new Response(`<!DOCTYPE html>${markup}`, {
        status: responseStatusCode,
        headers: responseHeaders,
    });
}

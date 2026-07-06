"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const React = __importStar(require("react"));
const client_1 = require("react-dom/client");
const react_1 = require("@remix-run/react");
const react_2 = require("@emotion/react");
const context_1 = require("./utils/context");
const create_emotion_cache_1 = __importStar(require("./utils/create-emotion-cache"));
function ClientCacheProvider({ children }) {
    const [cache, setCache] = React.useState(create_emotion_cache_1.defaultCache);
    function reset() {
        setCache((0, create_emotion_cache_1.default)());
    }
    return (<context_1.ClientStyleContext.Provider value={{ reset }}>
      <react_2.CacheProvider value={cache}>{children}</react_2.CacheProvider>
    </context_1.ClientStyleContext.Provider>);
}
(0, client_1.hydrateRoot)(document, <ClientCacheProvider>
    <react_1.RemixBrowser />
  </ClientCacheProvider>);

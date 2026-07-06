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
exports.links = exports.meta = void 0;
exports.loader = loader;
exports.default = App;
const React = __importStar(require("react"));
const node_1 = require("@remix-run/node");
const react_1 = require("@remix-run/react");
const react_2 = require("@emotion/react");
const react_3 = require("@chakra-ui/react");
const react_4 = require("react");
const context_1 = require("./utils/context");
const cognito_client_1 = require("@saws/cognito/cognito-client");
async function loader() {
    return (0, node_1.json)({
        ENV: {
            STAGE: process.env.STAGE,
            ...(0, cognito_client_1.captureAuthEnvVars)("demo-cognito"),
        },
    });
}
const meta = () => [
    {
        charset: "utf-8",
    },
    {
        title: "PM Docs",
    },
    {
        viewport: "width=device-width,initial-scale=1",
    },
];
exports.meta = meta;
let links = () => {
    return [
        { rel: "preconnect", href: "https://fonts.googleapis.com" },
        { rel: "preconnect", href: "https://fonts.gstatic.com" },
        {
            rel: "stylesheet",
            href: "https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,300;1,400;1,500;1,600;1,700;1,800&display=swap",
        },
    ];
};
exports.links = links;
const Document = (0, react_2.withEmotionCache)(({ children }, emotionCache) => {
    const data = (0, react_1.useLoaderData)();
    const serverStyleData = (0, react_4.useContext)(context_1.ServerStyleContext);
    const clientStyleData = (0, react_4.useContext)(context_1.ClientStyleContext);
    // Only executed on client
    (0, react_4.useEffect)(() => {
        // re-link sheet container
        emotionCache.sheet.container = document.head;
        // re-inject tags
        const tags = emotionCache.sheet.tags;
        emotionCache.sheet.flush();
        tags.forEach((tag) => {
            emotionCache.sheet._insertTag(tag);
        });
        // reset cache to reapply global styles
        clientStyleData?.reset();
    }, []);
    return (<html lang="en">
        <head>
          <react_1.Meta />
          <react_1.Links />
          {serverStyleData?.map(({ key, ids, css }) => (<style key={key} data-emotion={`${key} ${ids.join(' ')}`} dangerouslySetInnerHTML={{ __html: css }}/>))}
          <script dangerouslySetInnerHTML={{
            __html: `window.ENV = ${JSON.stringify(data.ENV)}`,
        }}/>
        </head>
        <body>
          {children}
          <react_1.ScrollRestoration />
          <react_1.Scripts />
          <react_1.LiveReload />
        </body>
      </html>);
});
function App() {
    return (<Document>
      <react_3.ChakraProvider>
        <react_1.Outlet />
      </react_3.ChakraProvider>
    </Document>);
}

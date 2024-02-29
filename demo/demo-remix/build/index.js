var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf, __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: !0 });
}, __copyProps = (to, from, except, desc) => {
  if (from && typeof from == "object" || typeof from == "function")
    for (let key of __getOwnPropNames(from))
      !__hasOwnProp.call(to, key) && key !== except && __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: !0 }) : target,
  mod
)), __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: !0 }), mod);

// empty-module:../utils/session.client
var require_session = __commonJS({
  "empty-module:../utils/session.client"(exports, module2) {
    module2.exports = {};
  }
});

// empty-module:../../utils/session.client
var require_session2 = __commonJS({
  "empty-module:../../utils/session.client"(exports, module2) {
    module2.exports = {};
  }
});

// <stdin>
var stdin_exports = {};
__export(stdin_exports, {
  assets: () => assets_manifest_default,
  assetsBuildDirectory: () => assetsBuildDirectory,
  entry: () => entry,
  future: () => future,
  mode: () => mode,
  publicPath: () => publicPath,
  routes: () => routes
});
module.exports = __toCommonJS(stdin_exports);

// demo-remix/app/entry.server.tsx
var entry_server_exports = {};
__export(entry_server_exports, {
  default: () => handleRequest
});
var import_server = require("react-dom/server"), import_react2 = require("@remix-run/react"), import_react3 = require("@emotion/react"), import_create_instance = __toESM(require("@emotion/server/create-instance"));

// demo-remix/app/utils/context.tsx
var import_react = require("react"), ServerStyleContext = (0, import_react.createContext)(null), ClientStyleContext = (0, import_react.createContext)(null);

// demo-remix/app/utils/create-emotion-cache.ts
var import_cache = __toESM(require("@emotion/cache")), defaultCache = createEmotionCache();
function createEmotionCache() {
  return (0, import_cache.default)({ key: "cha" });
}

// demo-remix/app/entry.server.tsx
var import_jsx_dev_runtime = require("react/jsx-dev-runtime");
function handleRequest(request, responseStatusCode, responseHeaders, remixContext) {
  let cache = createEmotionCache(), { extractCriticalToChunks } = (0, import_create_instance.default)(cache), html = (0, import_server.renderToString)(
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(ServerStyleContext.Provider, { value: null, children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(import_react3.CacheProvider, { value: cache, children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(import_react2.RemixServer, { context: remixContext, url: request.url }, void 0, !1, {
      fileName: "demo-remix/app/entry.server.tsx",
      lineNumber: 22,
      columnNumber: 9
    }, this) }, void 0, !1, {
      fileName: "demo-remix/app/entry.server.tsx",
      lineNumber: 21,
      columnNumber: 7
    }, this) }, void 0, !1, {
      fileName: "demo-remix/app/entry.server.tsx",
      lineNumber: 20,
      columnNumber: 5
    }, this)
  ), chunks = extractCriticalToChunks(html), markup = (0, import_server.renderToString)(
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(ServerStyleContext.Provider, { value: chunks.styles, children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(import_react3.CacheProvider, { value: cache, children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(import_react2.RemixServer, { context: remixContext, url: request.url }, void 0, !1, {
      fileName: "demo-remix/app/entry.server.tsx",
      lineNumber: 32,
      columnNumber: 9
    }, this) }, void 0, !1, {
      fileName: "demo-remix/app/entry.server.tsx",
      lineNumber: 31,
      columnNumber: 7
    }, this) }, void 0, !1, {
      fileName: "demo-remix/app/entry.server.tsx",
      lineNumber: 30,
      columnNumber: 5
    }, this)
  );
  return responseHeaders.set("Content-Type", "text/html"), new Response(`<!DOCTYPE html>${markup}`, {
    status: responseStatusCode,
    headers: responseHeaders
  });
}

// demo-remix/app/root.tsx
var root_exports = {};
__export(root_exports, {
  default: () => App,
  links: () => links,
  loader: () => loader,
  meta: () => meta
});
var import_node = require("@remix-run/node"), import_react4 = require("@remix-run/react"), import_react5 = require("@emotion/react"), import_react6 = require("@chakra-ui/react"), import_react7 = require("react");
var import_cognito_client = require("@saws/cognito/cognito-client"), import_jsx_dev_runtime2 = require("react/jsx-dev-runtime");
async function loader({ request }) {
  return (0, import_node.json)({
    ENV: {
      STAGE: process.env.STAGE,
      ...(0, import_cognito_client.captureAuthEnvVars)("demo-cognito")
    }
  });
}
var meta = () => [
  {
    charset: "utf-8"
  },
  {
    title: "PM Docs"
  },
  {
    viewport: "width=device-width,initial-scale=1"
  }
], links = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  { rel: "preconnect", href: "https://fonts.gstatic.com" },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,300;1,400;1,500;1,600;1,700;1,800&display=swap"
  }
], Document = (0, import_react5.withEmotionCache)(
  ({ children }, emotionCache) => {
    let data = (0, import_react4.useLoaderData)(), serverStyleData = (0, import_react7.useContext)(ServerStyleContext), clientStyleData = (0, import_react7.useContext)(ClientStyleContext);
    return (0, import_react7.useEffect)(() => {
      emotionCache.sheet.container = document.head;
      let tags = emotionCache.sheet.tags;
      emotionCache.sheet.flush(), tags.forEach((tag) => {
        emotionCache.sheet._insertTag(tag);
      }), clientStyleData?.reset();
    }, []), /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("html", { lang: "en", children: [
      /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("head", { children: [
        /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(import_react4.Meta, {}, void 0, !1, {
          fileName: "demo-remix/app/root.tsx",
          lineNumber: 78,
          columnNumber: 11
        }, this),
        /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(import_react4.Links, {}, void 0, !1, {
          fileName: "demo-remix/app/root.tsx",
          lineNumber: 79,
          columnNumber: 11
        }, this),
        serverStyleData?.map(({ key, ids, css }) => /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(
          "style",
          {
            "data-emotion": `${key} ${ids.join(" ")}`,
            dangerouslySetInnerHTML: { __html: css }
          },
          key,
          !1,
          {
            fileName: "demo-remix/app/root.tsx",
            lineNumber: 81,
            columnNumber: 13
          },
          this
        )),
        /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(
          "script",
          {
            dangerouslySetInnerHTML: {
              __html: `window.ENV = ${JSON.stringify(data.ENV)}`
            }
          },
          void 0,
          !1,
          {
            fileName: "demo-remix/app/root.tsx",
            lineNumber: 87,
            columnNumber: 11
          },
          this
        )
      ] }, void 0, !0, {
        fileName: "demo-remix/app/root.tsx",
        lineNumber: 77,
        columnNumber: 9
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("body", { children: [
        children,
        /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(import_react4.ScrollRestoration, {}, void 0, !1, {
          fileName: "demo-remix/app/root.tsx",
          lineNumber: 95,
          columnNumber: 11
        }, this),
        /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(import_react4.Scripts, {}, void 0, !1, {
          fileName: "demo-remix/app/root.tsx",
          lineNumber: 96,
          columnNumber: 11
        }, this),
        /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(import_react4.LiveReload, {}, void 0, !1, {
          fileName: "demo-remix/app/root.tsx",
          lineNumber: 97,
          columnNumber: 11
        }, this)
      ] }, void 0, !0, {
        fileName: "demo-remix/app/root.tsx",
        lineNumber: 93,
        columnNumber: 9
      }, this)
    ] }, void 0, !0, {
      fileName: "demo-remix/app/root.tsx",
      lineNumber: 76,
      columnNumber: 7
    }, this);
  }
);
function App() {
  return /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(Document, { children: /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(import_react6.ChakraProvider, { children: /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(import_react4.Outlet, {}, void 0, !1, {
    fileName: "demo-remix/app/root.tsx",
    lineNumber: 108,
    columnNumber: 9
  }, this) }, void 0, !1, {
    fileName: "demo-remix/app/root.tsx",
    lineNumber: 107,
    columnNumber: 7
  }, this) }, void 0, !1, {
    fileName: "demo-remix/app/root.tsx",
    lineNumber: 106,
    columnNumber: 5
  }, this);
}

// demo-remix/app/routes/_index.tsx
var index_exports = {};
__export(index_exports, {
  default: () => index_default,
  loader: () => loader2
});
var import_node2 = require("@remix-run/node");

// demo-remix/app/utils/prisma.server.ts
var import_get_prisma_client = require("@saws/postgres/get-prisma-client"), prisma = (0, import_get_prisma_client.getPrismaClient)("demo-db");

// demo-remix/app/routes/_index.tsx
var import_react8 = require("@remix-run/react");

// demo-remix/app/utils/session.server.ts
var import_session = require("@saws/remix-auth/session");

// demo-remix/app/routes/_index.tsx
var import_react9 = require("@chakra-ui/react"), import_session3 = __toESM(require_session());

// demo-remix/app/utils/secrets.server.ts
var import_secrets_manager = require("@saws/secrets/secrets-manager"), secrets = new import_secrets_manager.SecretsManager("local");

// demo-remix/app/utils/functions.server.ts
var import_functions_client = require("@saws/function/functions-client"), functionsClient = new import_functions_client.FunctionsClient(process.env.STAGE);

// demo-remix/app/routes/_index.tsx
var import_jsx_dev_runtime3 = require("react/jsx-dev-runtime"), loader2 = async ({ request }) => {
  let session = await (0, import_session.getSession)("demo-cognito", request), secret = await secrets.get("super-secret"), user = null;
  session != null && (user = await prisma.user.upsert({
    where: {
      id: 1
    },
    update: {},
    create: {
      id: 1,
      cognito_id: session.sub ?? "",
      email: "email@email.com",
      first_name: "First",
      last_name: "Last",
      account_id: 1234
    }
  }));
  let response = await functionsClient.call("demo-typescript-function", {
    call: "me"
  });
  return (0, import_node2.json)({
    user,
    secret,
    functionResponse: response
  });
}, index_default = () => {
  let data = (0, import_react8.useLoaderData)(), { revalidate } = (0, import_react8.useRevalidator)();
  return /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)("div", { children: [
    /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)("p", { children: "Hello world!" }, void 0, !1, {
      fileName: "demo-remix/app/routes/_index.tsx",
      lineNumber: 50,
      columnNumber: 7
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)("h3", { children: "Current User:" }, void 0, !1, {
      fileName: "demo-remix/app/routes/_index.tsx",
      lineNumber: 51,
      columnNumber: 7
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)("pre", { children: JSON.stringify(data.user, null, 2) }, void 0, !1, {
      fileName: "demo-remix/app/routes/_index.tsx",
      lineNumber: 52,
      columnNumber: 7
    }, this),
    data.user != null ? /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)(import_react9.Button, { onClick: () => {
      import_session3.sessionClient.signOut(), revalidate();
    }, children: "Log out" }, void 0, !1, {
      fileName: "demo-remix/app/routes/_index.tsx",
      lineNumber: 53,
      columnNumber: 28
    }, this) : /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)(import_react8.Link, { to: "/auth", children: "Sign In" }, void 0, !1, {
      fileName: "demo-remix/app/routes/_index.tsx",
      lineNumber: 56,
      columnNumber: 29
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)("p", { children: data.secret }, void 0, !1, {
      fileName: "demo-remix/app/routes/_index.tsx",
      lineNumber: 57,
      columnNumber: 7
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)("p", { children: JSON.stringify(data.functionResponse) }, void 0, !1, {
      fileName: "demo-remix/app/routes/_index.tsx",
      lineNumber: 58,
      columnNumber: 7
    }, this)
  ] }, void 0, !0, {
    fileName: "demo-remix/app/routes/_index.tsx",
    lineNumber: 49,
    columnNumber: 5
  }, this);
};

// demo-remix/app/routes/email.tsx
var email_exports = {};
__export(email_exports, {
  action: () => action,
  default: () => email_default
});
var import_react10 = require("@chakra-ui/react"), import_node3 = require("@remix-run/node"), import_react11 = require("@remix-run/react");

// demo-remix/app/utils/email.server.ts
var import_email_library = require("@saws/email/email-library"), email = new import_email_library.Email();

// demo-remix/app/routes/email.tsx
var import_jsx_dev_runtime4 = require("react/jsx-dev-runtime"), action = async ({ request }) => {
  let formData = await request.formData(), from = String(formData.get("from")), to = String(formData.get("to")), subject = String(formData.get("subject")), body = String(formData.get("body"));
  return await email.sendEmail({
    to: [to],
    subject,
    type: "html",
    message: body,
    source: from
  }), (0, import_node3.json)({ sent: !0 });
}, email_default = () => /* @__PURE__ */ (0, import_jsx_dev_runtime4.jsxDEV)(import_react10.Container, { children: [
  /* @__PURE__ */ (0, import_jsx_dev_runtime4.jsxDEV)(import_react10.Heading, { children: "Send Email" }, void 0, !1, {
    fileName: "demo-remix/app/routes/email.tsx",
    lineNumber: 36,
    columnNumber: 7
  }, this),
  /* @__PURE__ */ (0, import_jsx_dev_runtime4.jsxDEV)(import_react11.Form, { method: "post", children: [
    /* @__PURE__ */ (0, import_jsx_dev_runtime4.jsxDEV)(import_react10.FormControl, { children: [
      /* @__PURE__ */ (0, import_jsx_dev_runtime4.jsxDEV)(import_react10.FormLabel, { children: "From:" }, void 0, !1, {
        fileName: "demo-remix/app/routes/email.tsx",
        lineNumber: 39,
        columnNumber: 11
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime4.jsxDEV)(import_react10.Input, { name: "from" }, void 0, !1, {
        fileName: "demo-remix/app/routes/email.tsx",
        lineNumber: 40,
        columnNumber: 11
      }, this)
    ] }, void 0, !0, {
      fileName: "demo-remix/app/routes/email.tsx",
      lineNumber: 38,
      columnNumber: 9
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime4.jsxDEV)(import_react10.FormControl, { children: [
      /* @__PURE__ */ (0, import_jsx_dev_runtime4.jsxDEV)(import_react10.FormLabel, { children: "To:" }, void 0, !1, {
        fileName: "demo-remix/app/routes/email.tsx",
        lineNumber: 43,
        columnNumber: 11
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime4.jsxDEV)(import_react10.Input, { name: "to" }, void 0, !1, {
        fileName: "demo-remix/app/routes/email.tsx",
        lineNumber: 44,
        columnNumber: 11
      }, this)
    ] }, void 0, !0, {
      fileName: "demo-remix/app/routes/email.tsx",
      lineNumber: 42,
      columnNumber: 9
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime4.jsxDEV)(import_react10.FormControl, { children: [
      /* @__PURE__ */ (0, import_jsx_dev_runtime4.jsxDEV)(import_react10.FormLabel, { children: "Subject:" }, void 0, !1, {
        fileName: "demo-remix/app/routes/email.tsx",
        lineNumber: 47,
        columnNumber: 11
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime4.jsxDEV)(import_react10.Input, { name: "subject" }, void 0, !1, {
        fileName: "demo-remix/app/routes/email.tsx",
        lineNumber: 48,
        columnNumber: 11
      }, this)
    ] }, void 0, !0, {
      fileName: "demo-remix/app/routes/email.tsx",
      lineNumber: 46,
      columnNumber: 9
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime4.jsxDEV)(import_react10.FormControl, { children: [
      /* @__PURE__ */ (0, import_jsx_dev_runtime4.jsxDEV)(import_react10.FormLabel, { children: "Body" }, void 0, !1, {
        fileName: "demo-remix/app/routes/email.tsx",
        lineNumber: 51,
        columnNumber: 11
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime4.jsxDEV)(import_react10.Textarea, { name: "body" }, void 0, !1, {
        fileName: "demo-remix/app/routes/email.tsx",
        lineNumber: 52,
        columnNumber: 11
      }, this)
    ] }, void 0, !0, {
      fileName: "demo-remix/app/routes/email.tsx",
      lineNumber: 50,
      columnNumber: 9
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime4.jsxDEV)(import_react10.Button, { type: "submit", children: "Send" }, void 0, !1, {
      fileName: "demo-remix/app/routes/email.tsx",
      lineNumber: 54,
      columnNumber: 9
    }, this)
  ] }, void 0, !0, {
    fileName: "demo-remix/app/routes/email.tsx",
    lineNumber: 37,
    columnNumber: 7
  }, this)
] }, void 0, !0, {
  fileName: "demo-remix/app/routes/email.tsx",
  lineNumber: 35,
  columnNumber: 5
}, this);

// demo-remix/app/routes/files.tsx
var files_exports = {};
__export(files_exports, {
  action: () => action2,
  default: () => files_default,
  loader: () => loader3
});
var import_node4 = require("@remix-run/node");

// demo-remix/app/utils/file-storage.server.ts
var import_file_storage_library = require("@saws/file-storage/file-storage-library"), files = new import_file_storage_library.FileStorage("demo-files");

// demo-remix/app/routes/files.tsx
var import_react12 = require("@remix-run/react"), import_react13 = require("@chakra-ui/react");

// demo-remix/app/utils/multipartFormData.server.ts
var import_multipart_form_data = require("@saws/remix/multipart-form-data");

// demo-remix/app/routes/files.tsx
var import_path = __toESM(require("path")), import_node_fs = __toESM(require("node:fs")), import_jsx_dev_runtime5 = require("react/jsx-dev-runtime"), loader3 = async () => {
  let allFiles = await files.listFiles("");
  return (0, import_node4.json)({ files: allFiles });
}, action2 = async ({ request }) => {
  let filePath = (await (0, import_multipart_form_data.multipartFormData)(request)).get("file")?.toString();
  if (filePath == null)
    throw new Response("Missing file", { status: 400 });
  let parsed = import_path.default.parse(filePath);
  return await files.writeFile(parsed.base, import_node_fs.default.readFileSync(filePath)), (0, import_node4.json)({ uploaded: !0 });
}, files_default = () => {
  let data = (0, import_react12.useLoaderData)();
  return /* @__PURE__ */ (0, import_jsx_dev_runtime5.jsxDEV)("div", { children: [
    /* @__PURE__ */ (0, import_jsx_dev_runtime5.jsxDEV)(import_react12.Form, { method: "post", encType: "multipart/form-data", children: [
      /* @__PURE__ */ (0, import_jsx_dev_runtime5.jsxDEV)("label", { children: [
        "Upload File",
        /* @__PURE__ */ (0, import_jsx_dev_runtime5.jsxDEV)("input", { type: "file", name: "file" }, void 0, !1, {
          fileName: "demo-remix/app/routes/files.tsx",
          lineNumber: 36,
          columnNumber: 11
        }, this)
      ] }, void 0, !0, {
        fileName: "demo-remix/app/routes/files.tsx",
        lineNumber: 34,
        columnNumber: 9
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime5.jsxDEV)(import_react13.Button, { type: "submit", children: "Upload" }, void 0, !1, {
        fileName: "demo-remix/app/routes/files.tsx",
        lineNumber: 38,
        columnNumber: 9
      }, this)
    ] }, void 0, !0, {
      fileName: "demo-remix/app/routes/files.tsx",
      lineNumber: 33,
      columnNumber: 7
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime5.jsxDEV)("ul", { children: data.files?.map((file) => /* @__PURE__ */ (0, import_jsx_dev_runtime5.jsxDEV)("li", { children: file.Key }, void 0, !1, {
      fileName: "demo-remix/app/routes/files.tsx",
      lineNumber: 42,
      columnNumber: 11
    }, this)) }, void 0, !1, {
      fileName: "demo-remix/app/routes/files.tsx",
      lineNumber: 40,
      columnNumber: 7
    }, this)
  ] }, void 0, !0, {
    fileName: "demo-remix/app/routes/files.tsx",
    lineNumber: 32,
    columnNumber: 5
  }, this);
};

// demo-remix/app/routes/auth/route.tsx
var route_exports = {};
__export(route_exports, {
  default: () => route_default,
  loader: () => loader4
});
var import_AuthenticateRoute = require("@saws/remix-auth/AuthenticateRoute"), import_session4 = __toESM(require_session2());

// demo-remix/app/routes/auth/loader.server.ts
var import_loader = require("@saws/remix-auth/loader"), loader4 = (0, import_loader.getLoader)("demo-cognito");

// demo-remix/app/routes/auth/route.tsx
var import_jsx_dev_runtime6 = require("react/jsx-dev-runtime"), route_default = () => /* @__PURE__ */ (0, import_jsx_dev_runtime6.jsxDEV)(import_AuthenticateRoute.AuthenticateRoute, { sessionClient: import_session4.sessionClient }, void 0, !1, {
  fileName: "demo-remix/app/routes/auth/route.tsx",
  lineNumber: 6,
  columnNumber: 22
}, this);

// server-assets-manifest:@remix-run/dev/assets-manifest
var assets_manifest_default = { entry: { module: "/public/build/entry.client-CDTQWD6Q.js", imports: ["/public/build/_shared/chunk-3KCFFSF2.js", "/public/build/_shared/chunk-B4K3L3XX.js", "/public/build/_shared/chunk-FIAIQAE6.js", "/public/build/_shared/chunk-DHNG6WOR.js", "/public/build/_shared/chunk-6YWED2OG.js", "/public/build/_shared/chunk-O6EFLRGU.js", "/public/build/_shared/chunk-PXTKUQU2.js", "/public/build/_shared/chunk-JBNZCGZY.js", "/public/build/_shared/chunk-K5D75JVZ.js", "/public/build/_shared/chunk-WI7YQ7UX.js"] }, routes: { root: { id: "root", parentId: void 0, path: "", index: void 0, caseSensitive: void 0, module: "/public/build/root-XR7575IK.js", imports: ["/public/build/_shared/chunk-5TTN32LP.js", "/public/build/_shared/chunk-22HSLLFL.js", "/public/build/_shared/chunk-YKFCUXYQ.js", "/public/build/_shared/chunk-HEF73ADB.js"], hasAction: !1, hasLoader: !0, hasClientAction: !1, hasClientLoader: !1, hasErrorBoundary: !1 }, "routes/_index": { id: "routes/_index", parentId: "root", path: void 0, index: !0, caseSensitive: void 0, module: "/public/build/routes/_index-2T3CB2NU.js", imports: ["/public/build/_shared/chunk-PAZ5JXXC.js"], hasAction: !1, hasLoader: !0, hasClientAction: !1, hasClientLoader: !1, hasErrorBoundary: !1 }, "routes/auth": { id: "routes/auth", parentId: "root", path: "auth", index: void 0, caseSensitive: void 0, module: "/public/build/routes/auth-7EH6FG3C.js", imports: ["/public/build/_shared/chunk-PAZ5JXXC.js"], hasAction: !1, hasLoader: !0, hasClientAction: !1, hasClientLoader: !1, hasErrorBoundary: !1 }, "routes/email": { id: "routes/email", parentId: "root", path: "email", index: void 0, caseSensitive: void 0, module: "/public/build/routes/email-3OSYK7LL.js", imports: void 0, hasAction: !0, hasLoader: !1, hasClientAction: !1, hasClientLoader: !1, hasErrorBoundary: !1 }, "routes/files": { id: "routes/files", parentId: "root", path: "files", index: void 0, caseSensitive: void 0, module: "/public/build/routes/files-ENEL5DQJ.js", imports: void 0, hasAction: !0, hasLoader: !0, hasClientAction: !1, hasClientLoader: !1, hasErrorBoundary: !1 } }, version: "b3fac14e", hmr: { runtime: "/public/build/_shared/chunk-6YWED2OG.js", timestamp: 1708918826179 }, url: "/public/build/manifest-B3FAC14E.js" };

// server-entry-module:@remix-run/dev/server-build
var mode = "development", assetsBuildDirectory = "./.saws/build/demo-remix/public/build", future = { v3_fetcherPersist: !1, v3_relativeSplatPath: !1, v3_throwAbortReason: !1 }, publicPath = "/public/build/", entry = { module: entry_server_exports }, routes = {
  root: {
    id: "root",
    parentId: void 0,
    path: "",
    index: void 0,
    caseSensitive: void 0,
    module: root_exports
  },
  "routes/_index": {
    id: "routes/_index",
    parentId: "root",
    path: void 0,
    index: !0,
    caseSensitive: void 0,
    module: index_exports
  },
  "routes/email": {
    id: "routes/email",
    parentId: "root",
    path: "email",
    index: void 0,
    caseSensitive: void 0,
    module: email_exports
  },
  "routes/files": {
    id: "routes/files",
    parentId: "root",
    path: "files",
    index: void 0,
    caseSensitive: void 0,
    module: files_exports
  },
  "routes/auth": {
    id: "routes/auth",
    parentId: "root",
    path: "auth",
    index: void 0,
    caseSensitive: void 0,
    module: route_exports
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  assets,
  assetsBuildDirectory,
  entry,
  future,
  mode,
  publicPath,
  routes
});
//# sourceMappingURL=index.js.map

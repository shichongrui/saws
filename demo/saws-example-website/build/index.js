var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf, __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: !0 });
}, __copyProps = (to, from, except, desc) => {
  if (from && typeof from == "object" || typeof from == "function")
    for (let key of __getOwnPropNames(from))
      !__hasOwnProp.call(to, key) && key !== except && __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  return to;
}, __reExport = (target, mod, secondTarget) => (__copyProps(target, mod, "default"), secondTarget && __copyProps(secondTarget, mod, "default")), __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: !0 }) : target,
  mod
)), __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: !0 }), mod);

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

// saws-example-website/app/entry.server.tsx
var entry_server_exports = {};
__export(entry_server_exports, {
  default: () => handleRequest
});
var React = __toESM(require("react")), import_server = require("react-dom/server"), import_react = require("@remix-run/react");
function handleRequest(request, responseStatusCode, responseHeaders, remixContext) {
  let markup = (0, import_server.renderToString)(
    /* @__PURE__ */ React.createElement(import_react.RemixServer, { context: remixContext, url: request.url })
  );
  return responseHeaders.set("Content-Type", "text/html"), new Response(`<!DOCTYPE html>${markup}`, {
    status: responseStatusCode,
    headers: responseHeaders
  });
}

// saws-example-website/app/root.tsx
var root_exports = {};
__export(root_exports, {
  default: () => App,
  links: () => links,
  meta: () => meta
});
var React2 = __toESM(require("react")), import_react2 = require("@remix-run/react");

// ../libraries.ts
var libraries_exports = {};
__export(libraries_exports, {
  AuthClient: () => AuthClient,
  FileStorage: () => FileStorage,
  FunctionsClient: () => FunctionsClient,
  GraphQLAPI: () => GraphQLAPI,
  RemixApp: () => RemixApp,
  RestAPI: () => RestAPI,
  Router: () => import_express.Router,
  SecretsManager: () => SecretsManager,
  SessionClient: () => SessionClient,
  Translate: () => Translate,
  captureAuthEnvVars: () => captureAuthEnvVars,
  createFileUploadHandler: () => createFileUploadHandler,
  express: () => import_express.default,
  getPrismaClient: () => getPrismaClient,
  getSession: () => getSession,
  multipartFormData: () => multipartFormData
});

// ../libraries/api/index.ts
var api_exports = {};
__export(api_exports, {
  GraphQLAPI: () => GraphQLAPI,
  RestAPI: () => RestAPI,
  Router: () => import_express.Router,
  express: () => import_express.default
});

// ../libraries/api/GraphQLAPI.ts
var GraphQLAPI_exports = {};
__export(GraphQLAPI_exports, {
  GraphQLAPI: () => GraphQLAPI
});
var import_apollo_server_lambda = require("apollo-server-lambda");

// ../libraries/api/API.ts
var import_jsonwebtoken = require("jsonwebtoken"), API = class {
  user;
  token;
  logEvent(event) {
    let {
      headers: _headers,
      multiValueHeaders: _multiValueHeaders,
      requestContext: _requestContext,
      ...loggableEvent
    } = event;
    console.log(
      "Received request",
      JSON.stringify(
        {
          ...loggableEvent,
          body: (() => {
            try {
              return JSON.parse(event.body ?? "");
            } catch {
              return event.body ?? "";
            }
          })(),
          userId: this.user?.userId
        },
        null,
        2
      )
    );
  }
  authenticateRequest(event) {
    if (this.token = event.headers.authorization ?? event.headers.Authorization, this.token = this.token?.replace("Bearer ", "") ?? "", this.token != null) {
      let payload = (0, import_jsonwebtoken.decode)(this.token);
      this.user = {
        userId: payload?.sub,
        // @ts-expect-error
        username: payload?.username
      };
    }
  }
};

// ../libraries/api/GraphQLAPI.ts
__reExport(GraphQLAPI_exports, require("apollo-server-lambda"));
__reExport(GraphQLAPI_exports, require("aws-lambda"));
__reExport(GraphQLAPI_exports, require("graphql"));
var GraphQLAPI = class extends API {
  apolloServer;
  sourceMap;
  constructor({ typeDefs, resolvers, onError }) {
    super(), this.user = { userId: "", username: "" }, this.token = "", this.apolloServer = new import_apollo_server_lambda.ApolloServer({
      typeDefs,
      resolvers,
      csrfPrevention: !0,
      context: () => ({
        user: this.user,
        authToken: this.token
      }),
      plugins: [
        {
          requestDidStart() {
            return Promise.resolve({
              didEncounterErrors(requestContext) {
                let context = requestContext.context;
                for (let error of requestContext.errors) {
                  let err = error.originalError || error;
                  console.error("Error while processing request", err), onError?.(err, context.user);
                }
                return Promise.resolve();
              }
            });
          }
        }
      ]
    });
  }
  createLambdaHandler = () => {
    let handler = this.apolloServer.createHandler();
    return async (event, context, callback) => {
      context.callbackWaitsForEmptyEventLoop = !1, this.authenticateRequest(event), this.logEvent(event);
      try {
        let results = await handler(event, context, () => {
        });
        return callback(null, results), results;
      } catch (error) {
        console.error(
          "Error while processing request",
          JSON.stringify(error, null, 2)
        ), callback(error);
      }
    };
  };
};

// ../libraries/api/index.ts
__reExport(api_exports, GraphQLAPI_exports);

// ../libraries/api/RestAPI.ts
var import_serverless_http = __toESM(require("serverless-http")), import_express = __toESM(require("express")), RestAPI = class extends API {
  app;
  constructor(app) {
    super(), this.app = app, this.app.use((req, _res, next) => {
      req.user = this.user, next();
    });
  }
  createLambdaHandler = () => {
    let handler = (0, import_serverless_http.default)(this.app, { provider: "aws" });
    return async (event, context, callback) => {
      context.callbackWaitsForEmptyEventLoop = !1, this.authenticateRequest(event), this.logEvent(event);
      try {
        let results = await handler(event, context);
        return callback(null, results), results;
      } catch (error) {
        console.error(
          "Error while processing request",
          JSON.stringify(error, null, 2)
        ), callback(error);
      }
    };
  };
};

// ../libraries.ts
__reExport(libraries_exports, api_exports);

// ../helpers/aws/cognito.ts
var import_client_cognito_identity_provider = require("@aws-sdk/client-cognito-identity-provider"), Cognito = class {
  client;
  constructor(stage) {
    let config = {};
    stage === "local" && (config.endpoint = "http://localhost:9229", config.credentials = {
      accessKeyId: "cognito-local",
      secretAccessKey: "cognito-local"
    }), this.client = new import_client_cognito_identity_provider.CognitoIdentityProviderClient(config);
  }
  async listUserPools() {
    let command = new import_client_cognito_identity_provider.ListUserPoolsCommand({ MaxResults: 60 });
    return await this.client.send(command);
  }
  async listUserPoolClients(userPoolId) {
    let command = new import_client_cognito_identity_provider.ListUserPoolClientsCommand({
      UserPoolId: userPoolId
    });
    return await this.client.send(command);
  }
  async createUserPool(name) {
    let command = new import_client_cognito_identity_provider.CreateUserPoolCommand({
      PoolName: name,
      UsernameAttributes: ["email"],
      AutoVerifiedAttributes: ["email"]
    });
    return await this.client.send(command);
  }
  async createUserPoolClient(name, userPoolId) {
    let command = new import_client_cognito_identity_provider.CreateUserPoolClientCommand({
      ClientName: name,
      UserPoolId: userPoolId,
      ExplicitAuthFlows: ["ALLOW_USER_SRP_AUTH", "ALLOW_REFRESH_TOKEN_AUTH", "ALLOW_USER_PASSWORD_AUTH"],
      GenerateSecret: !1,
      AccessTokenValidity: 1,
      TokenValidityUnits: {
        AccessToken: "minutes"
      }
    });
    return await this.client.send(command);
  }
  async signUpUser(userPoolClientId, username, password) {
    let command = new import_client_cognito_identity_provider.SignUpCommand({
      ClientId: userPoolClientId,
      Username: username,
      Password: password,
      UserAttributes: [
        {
          Name: "email",
          Value: username
        }
      ]
    });
    return await this.client.send(command);
  }
  async confirmUserSignUp(userPoolId, username) {
    let command = new import_client_cognito_identity_provider.AdminConfirmSignUpCommand({
      UserPoolId: userPoolId,
      Username: username
    });
    return await this.client.send(command);
  }
  async getUser(userPoolId, username) {
    let command = new import_client_cognito_identity_provider.AdminGetUserCommand({
      UserPoolId: userPoolId,
      Username: username
    });
    return await this.client.send(command);
  }
  async initiateAuth(userPoolId, userPoolClientId, username, password) {
    let command = new import_client_cognito_identity_provider.AdminInitiateAuthCommand({
      UserPoolId: userPoolId,
      ClientId: userPoolClientId,
      AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
      AuthParameters: {
        USERNAME: username,
        PASSWORD: password
      }
    });
    return await this.client.send(command);
  }
  async refreshAuth(userPoolId, userPoolClientId, refreshToken) {
    let command = new import_client_cognito_identity_provider.AdminInitiateAuthCommand({
      UserPoolId: userPoolId,
      ClientId: userPoolClientId,
      AuthFlow: "REFRESH_TOKEN_AUTH",
      AuthParameters: {
        REFRESH_TOKEN: refreshToken
      }
    });
    return await this.client.send(command);
  }
  async deleteUser(token) {
    let command = new import_client_cognito_identity_provider.DeleteUserCommand({
      AccessToken: token
    });
    return await this.client.send(command);
  }
  async createUser({
    email,
    emailVerified
  }, userPoolId) {
    let command = new import_client_cognito_identity_provider.AdminCreateUserCommand({
      UserPoolId: userPoolId,
      Username: email,
      UserAttributes: [
        {
          Name: "email",
          Value: email
        },
        {
          Name: "email_verified",
          Value: String(emailVerified)
        }
      ],
      DesiredDeliveryMediums: ["EMAIL"]
    });
    return await this.client.send(command);
  }
};

// ../utils/parameterized-env-var-name.ts
var parameterizedEnvVarName = (name, variable) => `${name.replace(/[^a-zA-Z\d]/g, "_").toUpperCase()}_${variable}`;

// ../libraries/auth.ts
var import_amazon_cognito_identity_js = require("amazon-cognito-identity-js"), AuthClient = class {
  client;
  userPoolId;
  userPoolClientId;
  constructor(name) {
    let userPoolId = process.env[parameterizedEnvVarName(name, "USER_POOL_ID")], userPoolClientId = process.env[parameterizedEnvVarName(name, "USER_POOL_CLIENT_ID")];
    if (this.client = new Cognito(process.env.STAGE ?? "local"), userPoolId == null || userPoolClientId == null)
      throw new Error(
        "USER_POOL_ID and USER_POOL_CLIENT_ID must be present in the environment variables"
      );
    this.userPoolId = userPoolId, this.userPoolClientId = userPoolClientId;
  }
  deleteUserFromToken(token) {
    return this.client.deleteUser(token);
  }
  async createUser(email, emailVerified) {
    return await this.client.createUser(
      {
        email,
        emailVerified
      },
      this.userPoolId
    );
  }
  getUser(email) {
    return this.client.getUser(this.userPoolId, email);
  }
  async refreshAccessToken(refreshToken) {
    return (await this.client.refreshAuth(
      this.userPoolId,
      this.userPoolClientId,
      refreshToken
    )).AuthenticationResult?.AccessToken;
  }
}, captureAuthEnvVars = (name) => {
  let userPoolId = parameterizedEnvVarName(name, "USER_POOL_ID"), userPoolClientId = parameterizedEnvVarName(name, "USER_POOL_CLIENT_ID");
  return {
    [userPoolId]: process.env[userPoolId],
    [userPoolClientId]: process.env[userPoolClientId]
  };
}, SessionClient = class {
  userPool;
  constructor(name) {
    let userPoolId = window.ENV[parameterizedEnvVarName(name, "USER_POOL_ID")], userPoolClientId = window.ENV[parameterizedEnvVarName(name, "USER_POOL_CLIENT_ID")];
    this.userPool = new import_amazon_cognito_identity_js.CognitoUserPool({
      UserPoolId: userPoolId,
      ClientId: userPoolClientId,
      endpoint: window.ENV.STAGE === "local" ? "http://127.0.0.1:9229" : void 0,
      Storage: new import_amazon_cognito_identity_js.CookieStorage({
        domain: window?.location?.hostname,
        secure: window?.location?.hostname !== "localhost",
        path: "/",
        expires: 365
      })
    });
  }
  getCurrentUser() {
    return this.userPool.getCurrentUser();
  }
  async signIn(username, password) {
    return new Promise((resolve3, reject) => {
      let cognitoUser = new import_amazon_cognito_identity_js.CognitoUser({
        Username: username,
        Pool: this.userPool,
        Storage: new import_amazon_cognito_identity_js.CookieStorage({
          domain: window?.location?.hostname,
          secure: window?.location?.hostname !== "localhost",
          path: "/",
          expires: 365
        })
      });
      cognitoUser.setAuthenticationFlowType("USER_PASSWORD_AUTH"), cognitoUser.authenticateUser(
        new import_amazon_cognito_identity_js.AuthenticationDetails({ Username: username, Password: password }),
        {
          onSuccess: () => {
            resolve3(cognitoUser);
          },
          onFailure: (err) => {
            reject(err);
          }
        }
      );
    });
  }
  async signUp({
    username,
    password,
    attributes,
    autoSignIn
  }) {
    return new Promise((resolve3, reject) => {
      let attributeList = [];
      for (let key in attributes)
        attributeList.push(
          new import_amazon_cognito_identity_js.CognitoUserAttribute({
            Name: key,
            Value: attributes[key]
          })
        );
      this.userPool.signUp(
        username,
        password,
        attributeList,
        [],
        async (err, result) => {
          if (err) {
            reject(err);
            return;
          }
          if (autoSignIn && autoSignIn.enabled)
            try {
              await this.signIn(username, password), resolve3(result);
            } catch (signInError) {
              reject(signInError);
            }
          else
            resolve3(result);
        }
      );
    });
  }
  async confirmSignUp(email, code) {
    return new Promise((resolve3, reject) => {
      let userData = {
        Username: email,
        Pool: this.userPool,
        Storage: new import_amazon_cognito_identity_js.CookieStorage({
          domain: window?.location?.hostname,
          secure: window?.location?.hostname !== "localhost",
          path: "/",
          expires: 365
        })
      };
      new import_amazon_cognito_identity_js.CognitoUser(userData).confirmRegistration(code, !0, (err) => {
        if (err)
          return reject(err);
        resolve3(null);
      });
    });
  }
  async completeNewPassword(user, newPassword) {
    return new Promise((resolve3, reject) => {
      user.completeNewPasswordChallenge(newPassword, null, {
        onSuccess: () => {
          resolve3(null);
        },
        onFailure: (err) => {
          reject(err);
        }
      });
    });
  }
  signOut() {
    return this.getCurrentUser()?.signOut();
  }
  refreshTokenIfNeeded() {
    let currentUser = this.getCurrentUser();
    currentUser?.getSession(
      (err, session) => {
        if (err != null || session == null)
          return currentUser.signOut();
        if (session.isValid())
          return;
        let refreshToken = session.getRefreshToken();
        currentUser.refreshSession(refreshToken, (err2) => {
          err2 != null && currentUser.signOut();
        });
      }
    );
  }
};

// ../helpers/aws/s3.ts
var import_client_s3 = require("@aws-sdk/client-s3"), import_s3_request_presigner = require("@aws-sdk/s3-request-presigner"), import_fs = require("fs"), import_mime = __toESM(require("mime")), S3 = class {
  client;
  constructor() {
    let config = {};
    process.env.S3_ENDPOINT != null && (config.endpoint = process.env.S3_ENDPOINT), (process.env.S3_ACCESS_KEY != null || process.env.S3_SECRET_KEY != null) && (config.credentials = {
      accessKeyId: String(process.env.S3_ACCESS_KEY),
      secretAccessKey: String(process.env.S3_SECRET_KEY)
    }), this.client = new import_client_s3.S3Client(config);
  }
  async uploadFileFromPath(bucketName, key, filePath) {
    let file = await import_fs.promises.readFile(filePath);
    return this.uploadFile(bucketName, key, file);
  }
  uploadFile(bucketName, key, file) {
    let contentType = import_mime.default.getType(key), command = new import_client_s3.PutObjectCommand({
      Bucket: bucketName,
      Body: file,
      Key: key,
      ContentType: contentType ?? void 0
    });
    return this.client.send(command);
  }
  async doesFileExist(bucketName, key) {
    let command = new import_client_s3.HeadObjectCommand({
      Bucket: bucketName,
      Key: key
    });
    try {
      return await this.client.send(command), !0;
    } catch (err) {
      if (err.name === "NotFound")
        return !1;
      throw err;
    }
  }
  getFile(bucketName, key) {
    let command = new import_client_s3.GetObjectCommand({
      Bucket: bucketName,
      Key: key
    });
    return this.client.send(command);
  }
  getPresignedFileUrl(bucketName, key) {
    let command = new import_client_s3.GetObjectCommand({
      Bucket: bucketName,
      Key: key
    });
    return (0, import_s3_request_presigner.getSignedUrl)(this.client, command, { expiresIn: 3600 });
  }
  getPresignedUploadUrl(bucketName, key) {
    let command = new import_client_s3.PutObjectCommand({
      Bucket: bucketName,
      Key: key
    });
    return (0, import_s3_request_presigner.getSignedUrl)(this.client, command, { expiresIn: 3600 });
  }
  listBuckets() {
    let command = new import_client_s3.ListBucketsCommand({});
    return this.client.send(command);
  }
  createBucket(bucketName) {
    let command = new import_client_s3.CreateBucketCommand({
      Bucket: bucketName
    });
    return this.client.send(command);
  }
  listObjects(bucketName, prefix, delimiter) {
    let command = new import_client_s3.ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: prefix,
      Delimiter: delimiter
    });
    return this.client.send(command);
  }
};

// ../libraries/file-storage.ts
var FileStorage = class {
  name;
  client;
  constructor(name) {
    this.name = name, this.client = new S3();
  }
  getBucketName() {
    return `${process.env.STAGE}-${this.name}`;
  }
  async getFile(path2) {
    return await this.client.getFile(this.getBucketName(), path2);
  }
  async getFileUrl(path2) {
    return await this.client.getPresignedFileUrl(this.getBucketName(), path2);
  }
  async getFileUploadUrl(path2) {
    return await this.client.getPresignedUploadUrl(this.getBucketName(), path2);
  }
  async writeFile(path2, file) {
    return await this.client.uploadFile(this.getBucketName(), path2, file);
  }
};

// ../libraries/functions.ts
var import_client_lambda = require("@aws-sdk/client-lambda"), FunctionsClient = class {
  client;
  stage;
  constructor(stage = String(process.env.STAGE)) {
    let config = {};
    stage === "local" && (config.endpoint = "http://localhost:9000", config.credentials = {
      accessKeyId: "local-lambda",
      secretAccessKey: "local-lambda"
    }), this.client = new import_client_lambda.LambdaClient(config), this.stage = stage;
  }
  async call(name, payload, config = { async: !1 }) {
    let command = new import_client_lambda.InvokeCommand({
      FunctionName: `${this.stage}-${name}`,
      InvocationType: config.async ? "Event" : "RequestResponse",
      Payload: Buffer.from(JSON.stringify(payload))
    }), response = await this.client.send(command), responseText = new TextDecoder().decode(response.Payload);
    try {
      return JSON.parse(responseText);
    } catch {
      return responseText;
    }
  }
};

// ../libraries/postgres.ts
var import_client = require("@prisma/client");
var getPrismaClient = (name) => {
  let {
    [parameterizedEnvVarName(name, "POSTGRES_USERNAME")]: username,
    [parameterizedEnvVarName(name, "POSTGRES_HOST")]: host,
    [parameterizedEnvVarName(name, "POSTGRES_PORT")]: port,
    [parameterizedEnvVarName(name, "POSTGRES_DB_NAME")]: dbName,
    [parameterizedEnvVarName(name, "POSTGRES_PASSWORD")]: password
  } = process.env, DATABASE_URL = `postgres://${username}:${password}@${host}:${port}/${dbName}?connection_limit=1`;
  return new import_client.PrismaClient({
    datasources: {
      db: {
        url: DATABASE_URL
      }
    }
  });
};

// ../libraries/remix/remix-app.ts
var import_node = require("@remix-run/node");

// ../utils/binary-types.ts
var binaryTypes = [
  "application/octet-stream",
  // Docs
  "application/epub+zip",
  "application/msword",
  "application/pdf",
  "application/rtf",
  "application/vnd.amazon.ebook",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  // Fonts
  "font/otf",
  "font/woff",
  "font/woff2",
  // Images
  "image/avif",
  "image/bmp",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/tiff",
  "image/vnd.microsoft.icon",
  "image/webp",
  // Audio
  "audio/3gpp",
  "audio/aac",
  "audio/basic",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "audio/x-aiff",
  "audio/x-midi",
  "audio/x-wav",
  // Video
  "video/3gpp",
  "video/mp2t",
  "video/mpeg",
  "video/ogg",
  "video/quicktime",
  "video/webm",
  "video/x-msvideo",
  // Archives
  "application/java-archive",
  "application/vnd.apple.installer+xml",
  "application/x-7z-compressed",
  "application/x-apple-diskimage",
  "application/x-bzip",
  "application/x-bzip2",
  "application/x-gzip",
  "application/x-java-archive",
  "application/x-rar-compressed",
  "application/x-tar",
  "application/x-zip",
  "application/zip"
];
function isBinaryType(contentType) {
  if (!contentType)
    return !1;
  let [test] = contentType.split(";");
  return binaryTypes.includes(test);
}

// ../libraries/remix/remix-app.ts
var RemixApp = class {
  createLambdaHandler = ({
    getLoadContext,
    build
  }) => {
    let mode2 = process.env.STAGE === "local" ? "development" : "production", handleRequest2 = (0, import_node.createRequestHandler)(build, mode2);
    return async (event) => {
      try {
        let request = this.createRemixRequest(event), loadContext = await getLoadContext?.(event), response = await handleRequest2(request, loadContext);
        return this.sendRemixResponse(response);
      } catch (err) {
        throw console.log(err), err;
      }
    };
  };
  createRemixRequest(event) {
    let host = event.headers["x-forwarded-host"] || event.headers.host, search = event.rawQueryString.length ? `?${event.rawQueryString}` : "", url = new URL(`http://${host}${event.rawPath}${search}`), isFormData = event.headers["content-type"]?.includes(
      "multipart/form-data"
    ), controller = new AbortController();
    return new Request(url.href, {
      method: event.requestContext.http.method,
      headers: this.createRemixHeaders(event.headers, event.cookies),
      // Cast until reason/throwIfAborted added
      // https://github.com/mysticatea/abort-controller/issues/36
      signal: controller.signal,
      body: event.body && event.isBase64Encoded ? isFormData ? Buffer.from(event.body, "base64") : Buffer.from(event.body, "base64").toString() : event.body
    });
  }
  createRemixHeaders(requestHeaders, requestCookies) {
    let headers = new Headers();
    for (let [header, value] of Object.entries(requestHeaders))
      value && headers.append(header, value);
    return requestCookies && headers.append("Cookie", requestCookies.join("; ")), headers;
  }
  async sendRemixResponse(nodeResponse) {
    let cookies = [];
    for (let [key, value] of nodeResponse.headers.entries())
      key.toLowerCase() === "set-cookie" && cookies.push(value);
    cookies.length && nodeResponse.headers.delete("Set-Cookie");
    let contentType = nodeResponse.headers.get("Content-Type"), isBase64Encoded = isBinaryType(contentType), body;
    return nodeResponse.body && (isBase64Encoded ? body = await (0, import_node.readableStreamToString)(nodeResponse.body, "base64") : body = await nodeResponse.text()), {
      statusCode: nodeResponse.status,
      // @ts-expect-error
      headers: Object.fromEntries(nodeResponse.headers.entries()),
      cookies,
      body,
      isBase64Encoded
    };
  }
};

// ../libraries/remix/create-file-upload-handler.ts
var import_node_crypto = require("node:crypto"), import_node_fs = require("node:fs"), import_promises = require("node:fs/promises"), import_node_os = require("node:os"), import_node_path = require("node:path"), import_node_stream = require("node:stream"), import_node_util = require("node:util"), import_server_runtime = require("@remix-run/server-runtime"), defaultFilePathResolver = ({ filename }) => {
  let ext = filename ? (0, import_node_path.extname)(filename) : "";
  return "upload_" + (0, import_node_crypto.randomBytes)(4).readUInt32LE(0) + ext;
};
function createFileUploadHandler({
  directory = (0, import_node_os.tmpdir)(),
  file = defaultFilePathResolver,
  maxPartSize = 3e6
} = {}) {
  return async ({ name, filename, contentType, data }) => {
    if (!filename)
      return;
    let filedir = (0, import_node_path.resolve)(directory), path2 = typeof file == "string" ? file : file({ name, filename, contentType });
    if (!path2)
      return;
    let filepath = (0, import_node_path.resolve)(filedir, path2);
    await (0, import_promises.mkdir)((0, import_node_path.dirname)(filepath), { recursive: !0 }).catch(() => {
    });
    let writeFileStream = (0, import_node_fs.createWriteStream)(filepath), size = 0, deleteFile = !1;
    try {
      for await (let chunk of data) {
        if (size += chunk.byteLength, size > maxPartSize)
          throw deleteFile = !0, new import_server_runtime.MaxPartSizeExceededError(name, maxPartSize);
        writeFileStream.write(chunk);
      }
    } finally {
      writeFileStream.end(), await (0, import_node_util.promisify)(import_node_stream.finished)(writeFileStream), deleteFile && await (0, import_promises.rm)(filepath).catch(() => {
      });
    }
    return filepath;
  };
}

// ../libraries/remix/multipart-form-data.ts
var import_node2 = require("@remix-run/node");
var multipartFormData = (request) => (0, import_node2.unstable_parseMultipartFormData)(
  request,
  (0, import_node2.unstable_composeUploadHandlers)(
    createFileUploadHandler({
      maxPartSize: 5e6,
      file: ({ filename }) => filename
    }),
    (0, import_node2.unstable_createMemoryUploadHandler)()
  )
);

// ../libraries/remix/session.server.ts
var import_jwks_rsa = __toESM(require("jwks-rsa")), import_jsonwebtoken2 = __toESM(require("jsonwebtoken"));
async function getSession(name, request) {
  let client = (0, import_jwks_rsa.default)({
    jwksUri: String(process.env[parameterizedEnvVarName(name, "USER_POOL_JWKS_URI")])
  }), getJwksKey = (header, callback) => {
    client.getSigningKey(header.kid, (_, key) => {
      callback(null, key?.getPublicKey());
    });
  }, verifyToken = (accessToken2) => new Promise((resolve3, reject) => {
    import_jsonwebtoken2.default.verify(accessToken2, getJwksKey, {}, (err, decoded) => {
      if (err)
        return reject(err);
      resolve3(decoded);
    });
  }), cookieString = request.headers.get("Cookie");
  if (cookieString == null)
    return;
  let cookies = cookieString.split(/;\s?/g), authCookie = cookies.find(
    (cookie) => cookie.match(/CognitoIdentityServiceProvider\..*\.accessToken/g)
  );
  if (authCookie == null)
    return;
  let accessToken = authCookie.split("=")[1];
  try {
    return await verifyToken(accessToken);
  } catch (err) {
    if (err instanceof Error && err.name === "TokenExpiredError") {
      let refreshCookie = cookies.find(
        (cookie) => cookie.match(/CognitoIdentityServiceProvider\..*\.refreshToken/g)
      );
      if (refreshCookie == null)
        return;
      let refreshToken = refreshCookie.split("=")[1];
      if (refreshToken == null)
        return;
      try {
        let newAccessToken = await new AuthClient(name).refreshAccessToken(refreshToken);
        return newAccessToken == null ? void 0 : await verifyToken(newAccessToken);
      } catch (err2) {
        console.log("Failed to attempt refresh token validation", err2);
        return;
      }
    }
    console.log("Failed to validate access token", err);
    return;
  }
}

// ../helpers/aws/ssm.ts
var import_client_ssm = require("@aws-sdk/client-ssm"), SSM = class {
  client;
  constructor() {
    this.client = new import_client_ssm.SSMClient({});
  }
  async getParameter(name, decrypt = !1) {
    let command = new import_client_ssm.GetParameterCommand({
      Name: name,
      WithDecryption: decrypt
    });
    return (await this.client.send(command)).Parameter?.Value ?? "";
  }
  async putParameter(name, value, encrypt = !1) {
    let command = new import_client_ssm.PutParameterCommand({
      Name: name,
      Value: value,
      Type: encrypt ? import_client_ssm.ParameterType.SECURE_STRING : import_client_ssm.ParameterType.STRING
    });
    await this.client.send(command);
  }
};

// ../utils/constants.ts
var path = __toESM(require("path")), SAWS_DIR = path.resolve("./.saws"), BUILD_DIR = path.resolve(SAWS_DIR, "build");

// ../libraries/secrets.ts
var import_node_path2 = require("node:path"), import_envfile = require("envfile"), import_fs2 = require("fs"), cache = {}, LocalSecretsManager = class {
  secretsFilePath = (0, import_node_path2.resolve)(SAWS_DIR, ".secrets");
  async ensureSecretsFileExists() {
    try {
      await import_fs2.promises.stat(this.secretsFilePath);
    } catch {
      await import_fs2.promises.writeFile(this.secretsFilePath, "");
    }
  }
  async fillCache() {
    if (await this.ensureSecretsFileExists(), Object.keys(cache).length === 0) {
      let secretsFile = await import_fs2.promises.readFile(this.secretsFilePath, {
        encoding: "utf-8"
      });
      cache = (0, import_envfile.parse)(secretsFile);
    }
  }
  async get(name) {
    if (await this.fillCache(), cache[name] == null) {
      let error = new Error("Missing");
      throw error.name = "ParameterNotFound", error;
    }
    return cache[name];
  }
  async set(name, value) {
    await this.fillCache(), cache[name] = value, await import_fs2.promises.writeFile(this.secretsFilePath, (0, import_envfile.stringify)(cache));
  }
}, ParameterStoreSecretsManager = class {
  stage;
  ssmClient;
  constructor(stage) {
    this.stage = stage ?? process.env.STAGE, this.ssmClient = new SSM();
  }
  async get(name) {
    if (cache[name] != null)
      return cache[name];
    let value = await this.ssmClient.getParameter(
      `/${this.stage}/${name}`,
      !0
    );
    return cache[name] = value, value;
  }
  async set(name, value) {
    cache[name] = value, await this.ssmClient.putParameter(`/${this.stage}/${name}`, value, !0);
  }
}, SecretsManager = class {
  manager;
  constructor(stage) {
    this.manager = stage === "local" ? new LocalSecretsManager() : new ParameterStoreSecretsManager(stage);
  }
  get(name) {
    return this.manager.get(name);
  }
  set(name, value) {
    return this.manager.set(name, value);
  }
};

// ../libraries/translate.ts
var import_client_translate = require("@aws-sdk/client-translate"), Translate = class {
  client;
  constructor() {
    this.client = new import_client_translate.TranslateClient({});
  }
  async translateText(text, sourceLanguage, targetLanguage) {
    let command = new import_client_translate.TranslateTextCommand({
      Text: text,
      SourceLanguageCode: sourceLanguage,
      TargetLanguageCode: targetLanguage
    });
    return (await this.client.send(command)).TranslatedText;
  }
};

// saws-example-website/app/utils/secrets.server.ts
var secrets = new SecretsManager("local");

// saws-example-website/app/root.tsx
console.log(secrets);
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
], Document = ({ children }, emotionCache) => /* @__PURE__ */ React2.createElement("html", { lang: "en" }, /* @__PURE__ */ React2.createElement("head", null, /* @__PURE__ */ React2.createElement(import_react2.Meta, null), /* @__PURE__ */ React2.createElement(import_react2.Links, null)), /* @__PURE__ */ React2.createElement("body", null, children, /* @__PURE__ */ React2.createElement(import_react2.ScrollRestoration, null), /* @__PURE__ */ React2.createElement(import_react2.Scripts, null), /* @__PURE__ */ React2.createElement(import_react2.LiveReload, null)));
function App() {
  return /* @__PURE__ */ React2.createElement(Document, null, /* @__PURE__ */ React2.createElement(import_react2.Outlet, null));
}

// saws-example-website/app/routes/_index.tsx
var index_exports = {};
__export(index_exports, {
  default: () => index_default,
  loader: () => loader
});
var React3 = __toESM(require("react")), import_node3 = require("@remix-run/node");

// saws-example-website/app/utils/prisma.server.ts
var prisma = getPrismaClient("saws-example-db");

// saws-example-website/app/routes/_index.tsx
var import_react3 = require("@remix-run/react");

// saws-example-website/app/utils/functions.server.ts
var functionsClient = new FunctionsClient(process.env.STAGE);

// saws-example-website/app/utils/file-storage.server.ts
var files = new FileStorage("saws-example-files");

// saws-example-website/app/routes/_index.tsx
var loader = async ({ request }) => {
  let users = await prisma.user.findMany();
  console.log(users[0], Object.keys(users[0]));
  let result = await functionsClient.call("saws-example-function", {
    test: !0
  }), fileUrl = await files.getFileUrl("/1.png");
  return (0, import_node3.json)({
    users,
    result,
    fileUrl
  });
}, index_default = () => {
  let data = (0, import_react3.useLoaderData)();
  return console.log(data), /* @__PURE__ */ React3.createElement("div", null, /* @__PURE__ */ React3.createElement("p", null, "Hello world!"), /* @__PURE__ */ React3.createElement("p", null, String(data.result?.event.test)), /* @__PURE__ */ React3.createElement("ul", null, data.users.map((user) => /* @__PURE__ */ React3.createElement("li", { key: user.id }, user.first_name, " ", user.last_name))), /* @__PURE__ */ React3.createElement("img", { src: data.fileUrl }));
};

// server-assets-manifest:@remix-run/dev/assets-manifest
var assets_manifest_default = { entry: { module: "/public/build/entry.client-NQ3YT2S6.js", imports: ["/public/build/_shared/chunk-LBAIJNBE.js", "/public/build/_shared/chunk-Y54NFNLJ.js", "/public/build/_shared/chunk-NKWASPW3.js", "/public/build/_shared/chunk-75IOGHNW.js", "/public/build/_shared/chunk-JJMPHSMP.js", "/public/build/_shared/chunk-GDS3J3YF.js", "/public/build/_shared/chunk-QXY5AXJY.js"] }, routes: { root: { id: "root", parentId: void 0, path: "", index: void 0, caseSensitive: void 0, module: "/public/build/root-BYOPHQIY.js", imports: void 0, hasAction: !1, hasLoader: !1, hasErrorBoundary: !1 }, "routes/_index": { id: "routes/_index", parentId: "root", path: void 0, index: !0, caseSensitive: void 0, module: "/public/build/routes/_index-JWHSDOUE.js", imports: void 0, hasAction: !1, hasLoader: !0, hasErrorBoundary: !1 } }, version: "cf7e6cca", hmr: { runtime: "/public/build/_shared/chunk-NKWASPW3.js", timestamp: 1701415269887 }, url: "/public/build/manifest-CF7E6CCA.js" };

// server-entry-module:@remix-run/dev/server-build
var mode = "development", assetsBuildDirectory = "./.saws/build/saws-example-website/public/build", future = { v3_fetcherPersist: !1 }, publicPath = "/public/build/", entry = { module: entry_server_exports }, routes = {
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

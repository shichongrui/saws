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
exports.lambdaServer = exports.LambdaServer = void 0;
const node_http_1 = require("node:http");
const child_process_1 = require("child_process");
const collect_http_body_1 = require("@saws/utils/collect-http-body");
const path = __importStar(require("node:path"));
const node_crypto_1 = require("node:crypto");
class LambdaServer {
    server;
    started = false;
    functions = {};
    handler = async (req, res) => {
        const fullFunctionName = req.url
            ?.replace("/2015-03-31/functions/", "")
            .replace("/invocations", "") ?? "";
        const functionName = fullFunctionName.split("local-")[1];
        if (req.method !== "POST" || this.functions[functionName] == null) {
            res.writeHead(404);
            res.end();
            return;
        }
        const invocationType = req.headers["x-amz-invocation-type"];
        if (invocationType === "Event") {
            res.writeHead(200, undefined);
            res.end();
        }
        const requestBody = await (0, collect_http_body_1.collectHttpBody)(req);
        try {
            const results = await this.invokeFunction(functionName, JSON.parse(requestBody ?? ''), {});
            if (invocationType !== "Event") {
                res.writeHead(200, undefined);
                res.end(results);
            }
        }
        catch (err) {
            console.log(err);
            if (invocationType !== "Event") {
                res.writeHead(500, undefined);
                res.end(JSON.stringify(err));
            }
        }
    };
    async invokeFunction(name, event, context) {
        const func = this.functions[name];
        if (func == null)
            throw new Error("No function");
        const { definition, process } = func;
        if (definition.type === "container") {
            const response = await fetch(`http://localhost:${definition.containerPort}/2015-03-31/functions/function/invocations`, {
                method: "POST",
                body: JSON.stringify(event),
            });
            const responseText = await response.text();
            return responseText;
        }
        else if (definition.type === "javascript") {
            let id = (0, node_crypto_1.randomUUID)();
            let listener = function (resolve, reject, message) {
                if (message.type === "response" && message.id === id) {
                    resolve(JSON.stringify(message.response));
                }
                else if (message.type === "error" && message.id === id) {
                    reject(new Error(message.error));
                }
            };
            const promise = new Promise((resolve, reject) => {
                process.on("message", listener.bind(null, resolve, reject));
            });
            process.send({
                type: "invoke",
                event,
                context,
                id,
            });
            let response = await promise;
            process.removeListener('message', listener);
            return response;
        }
        throw new Error("Unsupported function type");
    }
    start() {
        if (this.started)
            return;
        console.log("Starting Lambda server...");
        this.server = (0, node_http_1.createServer)((req, res) => this.handler(req, res));
        this.started = true;
        return new Promise((resolve) => {
            this.server?.listen(9000, () => {
                console.log("Lambda server started");
                resolve(null);
            });
        });
    }
    close() {
        for (const func of Object.values(this.functions)) {
            func.process.kill(9);
        }
        if (!this.started)
            return;
        console.log("Closing lambda server...");
        this.server?.close();
        this.started = false;
    }
    registerContainerFunction(definition) {
        const existingProcess = this.functions[definition.name];
        existingProcess?.process.kill(9);
        const newProcess = (0, child_process_1.spawn)("docker", [
            "run",
            "--rm",
            "--name",
            definition.name,
            "-p",
            `${definition.containerPort}:8080`,
            definition.name,
        ]);
        newProcess.stdout.pipe(process.stdout);
        newProcess.stderr.pipe(process.stderr);
        this.functions[definition.name] = {
            definition,
            process: newProcess,
        };
        return newProcess;
    }
    async registerJavascriptFunction(definition) {
        const newProcess = (0, child_process_1.fork)(path.resolve(__dirname, "lambda-entrypoint.js"), {
            env: {
                NODE_ENV: 'development',
                STAGE: 'local',
                ...definition.environment
            },
            cwd: path.resolve("."),
        });
        newProcess.send({
            type: "load-function",
            path: definition.path,
        });
        const promise = await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error(`Issue registering ${definition.name}`)), 5000);
            newProcess.once("message", (message) => {
                if (message.type === "ready") {
                    clearTimeout(timeout);
                    resolve(null);
                }
                else if (message.type === "load-failed") {
                    clearTimeout(timeout);
                    reject(new Error(message.error ?? `Failed to load ${definition.name}`));
                }
            });
        });
        await promise;
        const existingProcess = this.functions[definition.name];
        existingProcess?.process.kill(9);
        this.functions[definition.name] = {
            definition,
            process: newProcess,
        };
        return newProcess;
    }
    registerFunction(definition) {
        switch (definition.type) {
            case "container":
                return this.registerContainerFunction(definition);
            case "javascript":
                return this.registerJavascriptFunction(definition);
        }
    }
}
exports.LambdaServer = LambdaServer;
exports.lambdaServer = new LambdaServer();

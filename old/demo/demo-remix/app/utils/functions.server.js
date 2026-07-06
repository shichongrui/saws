"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.functionsClient = void 0;
const functions_client_1 = require("@saws/function/functions-client");
exports.functionsClient = new functions_client_1.FunctionsClient(process.env.STAGE);

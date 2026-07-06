"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sessionClient = void 0;
const session_client_1 = require("@saws/cognito/session-client");
exports.sessionClient = new session_client_1.SessionClient('demo-cognito');

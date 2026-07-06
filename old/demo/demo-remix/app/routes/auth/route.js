"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loader = void 0;
const AuthenticateRoute_1 = require("@saws/remix-auth/AuthenticateRoute");
const session_client_1 = require("../../utils/session.client");
var loader_server_1 = require("./loader.server");
Object.defineProperty(exports, "loader", { enumerable: true, get: function () { return loader_server_1.loader; } });
exports.default = () => <AuthenticateRoute_1.AuthenticateRoute sessionClient={session_client_1.sessionClient}/>;

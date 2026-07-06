"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.secrets = void 0;
const secrets_manager_1 = require("@saws/secrets/secrets-manager");
exports.secrets = new secrets_manager_1.SecretsManager('local');

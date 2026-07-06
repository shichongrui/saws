"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDBName = exports.getDBUsername = exports.getDBPassword = exports.getDBParameters = exports.getDBPasswordParameterName = void 0;
const secrets_manager_1 = require("@saws/secrets/secrets-manager");
const generate_token_1 = require("@saws/utils/generate-token");
const getDBPasswordParameterName = (name, stage) => `${stage}-${name}-postgress-user-password`;
exports.getDBPasswordParameterName = getDBPasswordParameterName;
const getDBParameters = async (name, stage = process.env.STAGE) => {
    return {
        username: (0, exports.getDBUsername)(name, stage),
        name: (0, exports.getDBName)(name, stage),
        password: await (0, exports.getDBPassword)(name, stage),
        port: 5432,
        endpoint: "localhost",
    };
};
exports.getDBParameters = getDBParameters;
const getDBPassword = async (name, stage = process.env.STAGE) => {
    const secretsManager = new secrets_manager_1.SecretsManager(stage);
    try {
        const password = await secretsManager.get((0, exports.getDBPasswordParameterName)(name, stage));
        return password;
    }
    catch (err) {
        if (err.name !== "ParameterNotFound")
            throw err;
        const newPassword = await (0, generate_token_1.generateToken)();
        await secretsManager.set((0, exports.getDBPasswordParameterName)(name, stage), newPassword);
        return newPassword;
    }
};
exports.getDBPassword = getDBPassword;
const getDBUsername = (name, stage = process.env.STAGE) => {
    return `${name.replace(/[^a-zA-Z\d]/g, "_")}_${stage}`;
};
exports.getDBUsername = getDBUsername;
const getDBName = (name, stage = process.env.STAGE) => {
    return `${name.replace(/[^a-zA-Z\d]/g, "_")}_${stage}`;
};
exports.getDBName = getDBName;

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAwsAccountId = void 0;
const sts_1 = require("@saws/aws/sts");
const getAwsAccountId = async () => {
    const sts = new sts_1.STS();
    const { Account: accountId } = await sts.getCallerIdentity();
    return accountId;
};
exports.getAwsAccountId = getAwsAccountId;

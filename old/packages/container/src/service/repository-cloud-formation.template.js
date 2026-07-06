"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStackName = exports.getTemplate = void 0;
const uppercase_1 = require("@saws/utils/uppercase");
const getTemplate = ({ name, stage, }) => JSON.stringify({
    AWSTemplateFormatVersion: "2010-09-09",
    Description: `AWS Cloudformation for ${name} container repository`,
    Resources: {
        [`Saws${name.split("-").map(uppercase_1.uppercase).join("")}Repository`]: {
            Type: "AWS::ECR::Repository",
            Properties: {
                RepositoryName: `${name}-${stage}`,
            },
        },
    }
});
exports.getTemplate = getTemplate;
const getStackName = (stage, name) => {
    return `${stage}-${name}-repository`;
};
exports.getStackName = getStackName;

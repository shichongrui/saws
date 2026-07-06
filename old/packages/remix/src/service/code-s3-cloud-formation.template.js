"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStackName = exports.getTemplate = void 0;
const uppercase_1 = require("@saws/utils/uppercase");
const getTemplate = ({ name, bucketName }) => {
    const uppercasedName = name.split("-").map(uppercase_1.uppercase).join("");
    return JSON.stringify({
        AWSTemplateFormatVersion: "2010-09-09",
        Description: "AWS Cloudformation for Saws Remix Code S3 Bucket",
        Resources: {
            [`Saws${uppercasedName}CodeBucket`]: {
                Type: "AWS::S3::Bucket",
                Properties: {
                    BucketName: bucketName
                }
            }
        },
        Outputs: {
            codeS3Bucket: {
                Value: {
                    "Ref": `Saws${uppercasedName}CodeBucket`
                }
            }
        },
    });
};
exports.getTemplate = getTemplate;
const getStackName = (stage, name) => {
    return `${stage}-${name}-code`;
};
exports.getStackName = getStackName;

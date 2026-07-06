"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStackName = exports.getTemplate = void 0;
const uppercase_1 = require("@saws/utils/uppercase");
const getTemplate = ({ name, bucketName }) => {
    const uppercasedName = name.split("-").map(uppercase_1.uppercase).join("");
    return JSON.stringify({
        AWSTemplateFormatVersion: "2010-09-09",
        Description: "AWS Cloudformation for Saws File Storage S3 Bucket",
        Resources: {
            [`Saws${uppercasedName}Bucket`]: {
                Type: "AWS::S3::Bucket",
                Properties: {
                    BucketName: bucketName,
                    CorsConfiguration: {
                        CorsRules: [
                            {
                                AllowedHeaders: ["*"],
                                AllowedMethods: ["GET", "PUT", "POST"],
                                AllowedOrigins: ["*"],
                                ExposedHeaders: [],
                            },
                        ],
                    },
                },
            },
        },
    });
};
exports.getTemplate = getTemplate;
const getStackName = (stage, name) => {
    return `${stage}-${name}-s3`;
};
exports.getStackName = getStackName;

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStackName = exports.getTemplate = void 0;
const uppercase_1 = require("@saws/utils/uppercase");
const getTemplate = ({ name, stage, domain, }) => {
    return JSON.stringify({
        AWSTemplateFormatVersion: "2010-09-09",
        Description: "AWS Cloudformation for Saws Website S3",
        Resources: {
            WebsiteS3Bucket: {
                Type: "AWS::S3::Bucket",
                Properties: {
                    BucketName: domain,
                    AccessControl: "PublicRead",
                    WebsiteConfiguration: {
                        IndexDocument: "index.html"
                    },
                },
            },
            WebsiteBucketPolicy: {
                Type: "AWS::S3::BucketPolicy",
                Properties: {
                    PolicyDocument: {
                        Id: `${(0, uppercase_1.uppercase)(name)}${(0, uppercase_1.uppercase)(stage)}WebsitePolicy`,
                        Version: "2012-10-17",
                        Statement: [
                            {
                                Sid: "PublicReadForGetBucketObjects",
                                Effect: "Allow",
                                Principal: "*",
                                Action: "s3:GetObject",
                                Resource: {
                                    "Fn::Join": [
                                        "",
                                        [
                                            "arn:aws:s3:::",
                                            {
                                                Ref: "WebsiteS3Bucket",
                                            },
                                            "/*",
                                        ],
                                    ],
                                },
                            },
                        ],
                    },
                    Bucket: {
                        Ref: "WebsiteS3Bucket",
                    },
                },
            },
        },
        Outputs: {
            websiteS3Url: {
                Value: {
                    "Fn::GetAtt": ["WebsiteS3Bucket", "WebsiteURL"],
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

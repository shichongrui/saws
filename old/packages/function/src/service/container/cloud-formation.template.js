"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStackName = exports.getTemplate = void 0;
const uppercase_1 = require("@saws/utils/uppercase");
const getTemplate = ({ name, repositoryName, tag, stage, memory = 128, }) => {
    const uppercasedName = name.split("-").map(uppercase_1.uppercase).join("");
    return JSON.stringify({
        AWSTemplateFormatVersion: "2010-09-09",
        Description: `AWS Cloudformation for ${name} function`,
        Resources: {
            [`Saws${uppercasedName}LambdaRole`]: {
                Type: "AWS::IAM::Role",
                Properties: {
                    RoleName: `SawsFunction${uppercasedName}${(0, uppercase_1.uppercase)(stage)}LambdaRole`,
                    AssumeRolePolicyDocument: {
                        Version: "2012-10-17",
                        Statement: [
                            {
                                Effect: "Allow",
                                Principal: {
                                    Service: ["lambda.amazonaws.com"],
                                },
                                Action: ["sts:AssumeRole"],
                            },
                        ],
                    },
                    Path: "/",
                    Policies: [
                        {
                            PolicyName: `AWSLambda${uppercasedName}${(0, uppercase_1.uppercase)(stage)}BasicExecutionRole`,
                            PolicyDocument: {
                                Version: "2012-10-17",
                                Statement: [
                                    {
                                        Effect: "Allow",
                                        Action: [
                                            "logs:CreateLogGroup",
                                            "logs:CreateLogStream",
                                            "logs:PutLogEvents",
                                        ],
                                        Resource: "*",
                                    },
                                ],
                            },
                        },
                    ],
                },
            },
            [`Saws${uppercasedName}Lambda`]: {
                Type: "AWS::Lambda::Function",
                Properties: {
                    Code: {
                        ImageUri: { "Fn::Sub": `\${AWS::AccountId}.dkr.ecr.us-east-1.amazonaws.com/${repositoryName}:${tag}` },
                    },
                    FunctionName: `${stage}-${name}`,
                    PackageType: "Image",
                    MemorySize: memory,
                    Timeout: 60,
                    Role: {
                        "Fn::GetAtt": [`Saws${uppercasedName}LambdaRole`, "Arn"],
                    },
                },
            },
        },
    });
};
exports.getTemplate = getTemplate;
const getStackName = (stage, name) => {
    return `${stage}-${name}-function`;
};
exports.getStackName = getStackName;

import { getProjectName } from "@shichongrui/saws-core";
import { uppercase } from "../../../utils/uppercase";

type SawsFunctionTemplateProperties = {
  name: string;
  repositoryName: string;
  tag: string;
  projectName: string;
  stage: string;
  memory?: number;
};

export const getTemplate = ({
  name,
  repositoryName,
  tag,
  projectName,
  stage,
  memory = 128,
}: SawsFunctionTemplateProperties) => {
  const uppercasedName = name.split("-").map(uppercase).join("");
  return JSON.stringify({
    AWSTemplateFormatVersion: "2010-09-09",
    Description: `AWS Cloudformation for ${name} function`,
    Resources: {
      [`Saws${uppercasedName}LambdaRole`]: {
        Type: "AWS::IAM::Role",
        Properties: {
          RoleName: `SawsFunction${uppercasedName}${uppercase(stage)}LambdaRole`,
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
              PolicyName: `AWSLambda${uppercasedName}${uppercase(stage)}BasicExecutionRole`,
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
          FunctionName: `${projectName}-${stage}-${name}`,
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
}

export const getStackName = (stage: string, name: string) => {
  const projectName = getProjectName();
  return `${projectName}-${stage}-${name}`;
};

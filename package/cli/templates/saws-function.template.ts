import { FunctionConfig } from "../../config";
import { getProjectName } from "../../utils/get-project-name";
import { uppercase } from "../../utils/uppercase";

type SawsFunctionTemplateProperties = {
  config: FunctionConfig;
  repositoryName: string;
  tag: string;
  projectName: string;
  stage: string;
};

export default ({
  config,
  repositoryName,
  tag,
  projectName,
  stage,
}: SawsFunctionTemplateProperties) => {
  const uppercasedName = config.name.split("-").map(uppercase).join("");
  return JSON.stringify({
    AWSTemplateFormatVersion: "2010-09-09",
    Description: "AWS Cloudformation for functions in the SAWS framework",
    Resources: {
      [`Saws${uppercasedName}LambdaRole`]: {
        Type: "AWS::IAM::Role",
        Properties: {
          RoleName: `SawsFunction${uppercasedName}LambdaRole`,
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
              PolicyName: `AWSLambda${uppercasedName}BasicExecutionRole`,
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
      [`Saws${config.name.split("-").map(uppercase).join("")}Lambda`]: {
        Type: "AWS::Lambda::Function",
        Properties: {
          Code: {
            ImageUri: { "Fn::Sub": `\${AWS::AccountId}.dkr.ecr.us-east-1.amazonaws.com/${repositoryName}:${tag}` },
          },
          FunctionName: `${projectName}-${stage}-${config.name}`,
          PackageType: "Image",
          MemorySize: 512,
          Timeout: 60,
          Role: {
            "Fn::GetAtt": [`Saws${uppercasedName}LambdaRole`, "Arn"],
          },
        },
      },
    },
  });
}

export const getFunctionStackName = (config: FunctionConfig, stage: string) => {
  const projectName = getProjectName();
  return `${projectName}-${stage}-function-${config.name}`;
};

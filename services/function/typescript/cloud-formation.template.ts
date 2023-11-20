import { AWSPermission } from "../../../utils/aws-permission";
import { getProjectName } from "../../../utils/get-project-name";
import { uppercase } from "../../../utils/uppercase";
import { TypescriptFunctionServiceConfig } from "./TypescriptFunction";

type SawsFunctionTemplateProperties = {
  name: string;
  moduleName: string;
  projectName: string;
  codeBucketName: string;
  codeS3Key: string;
  stage: string;
  permissions: AWSPermission[];
  environment: Record<string, string>;
  triggers: TypescriptFunctionServiceConfig["triggers"];
};

export const getTemplate = ({
  name,
  moduleName,
  projectName,
  codeBucketName,
  codeS3Key,
  stage,
  permissions,
  environment,
  triggers,
}: SawsFunctionTemplateProperties) => {
  const uppercasedName = name.split("-").map(uppercase).join("");
  const template: Record<string, any> = {
    AWSTemplateFormatVersion: "2010-09-09",
    Description: `AWS Cloudformation for ${name} function`,
    Resources: {
      [`Saws${uppercasedName}LambdaRole`]: {
        Type: "AWS::IAM::Role",
        Properties: {
          RoleName: `SawsFunction${uppercasedName}${uppercase(
            stage
          )}LambdaRole`,
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
              PolicyName: `AWSLambda${uppercasedName}${uppercase(
                stage
              )}BasicExecutionRole`,
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
                  {
                    Effect: "Allow",
                    Action: ["ssm:GetParameter", "ssm:GetParameters"],
                    Resource: {
                      "Fn::Sub": `arn:aws:ssm:\${AWS::Region}:\${AWS::AccountId}:parameter/${stage}/*`,
                    },
                  },
                  ...permissions,
                ],
              },
            },
          ],
        },
      },
      [`Saws${uppercasedName}Lambda`]: {
        Type: "AWS::Lambda::Function",
        Properties: {
          Environment: {
            Variables: {
              NODE_ENV: "production",
              STAGE: stage,
              PROJECT_NAME: projectName,
              ...environment,
            },
          },
          FunctionName: `${projectName}-${stage}-${name}`,
          Handler: `${moduleName}.handler`,
          Runtime: "nodejs16.x",
          PackageType: "Zip",
          Role: {
            "Fn::GetAtt": [`Saws${uppercasedName}LambdaRole`, "Arn"],
          },
          Code: {
            S3Bucket: codeBucketName,
            S3Key: codeS3Key,
          },
          MemorySize: 1024,
          Timeout: 900,
        },
      },
    },
  };

  if (triggers?.cron != null) {
    template.Resources[`Saws${uppercasedName}EventRuleRole`] = {
      Type: "AWS::Lambda::Permission",
      Properties: {
        FunctionName: { "Fn::GetAtt": [`Saws${uppercasedName}Lambda`, "Arn"] },
        Action: "lambda:InvokeFunction",
        Principal: "events.amazonaws.com",
        SourceAccount: { Ref: "AWS::AccountId" },
        SourceArn: { "Fn::GetAtt": [`Saws${uppercasedName}EventRule`, "Arn"] },
      },
    };
    template.Resources[`Saws${uppercasedName}EventRule`] = {
      Type: "AWS::Events::Rule",
      Properties: {
        ScheduleExpression: triggers.cron,
        State: "ENABLED",
        Targets: [
          {
            Arn: { "Fn::GetAtt": [`Saws${uppercasedName}Lambda`, "Arn"] },
            Id: `${uppercasedName}Trigger`,
          },
        ],
      },
    };
  }

  return JSON.stringify(template);
};

export const getStackName = (stage: string, name: string) => {
  const projectName = getProjectName();
  return `${projectName}-${stage}-${name}`;
};

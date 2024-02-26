import type { AWSPermission } from "@shichongrui/saws-utils/aws-permission"
import { uppercase } from "@shichongrui/saws-utils/uppercase";
import { TypescriptFunctionServiceConfig } from "./TypescriptFunctionService";

type SawsFunctionTemplateProperties = {
  name: string;
  moduleName: string;
  codeBucketName: string;
  codeS3Key: string;
  stage: string;
  permissions: AWSPermission[];
  environment: Record<string, string>;
  triggers: TypescriptFunctionServiceConfig["triggers"];
  layers: Array<{ name: string, template: unknown}>;
};

export const getTemplate = ({
  name,
  moduleName,
  codeBucketName,
  codeS3Key,
  stage,
  permissions,
  environment,
  triggers,
  layers,
}: SawsFunctionTemplateProperties) => {
  const uppercasedName = name.split("-").map(uppercase).join("");
  const template: Record<string, any> = {
    AWSTemplateFormatVersion: "2010-09-09",
    Transform: 'AWS::Serverless-2016-10-31',
    Description: `AWS Cloudformation for ${name} function`,
    Resources: {
      ...layers.reduce((acc, { name, template }) => {
        acc[name] = template;
        return acc;
      }, {} as Record<string, unknown>),
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
              ...environment,
            },
          },
          FunctionName: `${stage}-${name}`,
          Handler: `${moduleName}.handler`,
          Runtime: "nodejs20.x",
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
          Layers: layers.map(({ name }) => ({ Ref: name })),
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
  return `${stage}-${name}-function`;
};

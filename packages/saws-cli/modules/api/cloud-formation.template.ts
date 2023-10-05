import { getProjectName } from "@shichongrui/saws-core";
import { uppercase } from "../../utils/uppercase";
import { AWSPermission } from "../ModuleDefinition";

type ApiTemplateProperties = {
  name: string;
  moduleName: string;
  projectName: string;
  codeBucketName: string;
  codeS3Key: string;
  stage: string;
  permissions: AWSPermission[];
  userPoolClientId?: string;
  userPoolId?: string;
  environment: Record<string, string>;
};

export const getTemplate = ({
  name,
  moduleName,
  projectName,
  codeBucketName,
  codeS3Key,
  stage,
  permissions,
  userPoolClientId,
  userPoolId,
  environment,
}: ApiTemplateProperties) => {
  const config: Record<string, any> = {
    AWSTemplateFormatVersion: "2010-09-09",
    Description: "AWS Cloudformation for API module",
    Resources: {
      SawsApiGateway: {
        Type: "AWS::ApiGatewayV2::Api",
        Properties: {
          ProtocolType: "HTTP",
          Name: `${projectName}-${stage}-${name}`,
          CorsConfiguration: {
            AllowMethods: ["*"],
            AllowOrigins: ["*"],
            AllowHeaders: ["*"],
          },
        },
      },
      SawsApiLambdaIntegration: {
        Type: "AWS::ApiGatewayV2::Integration",
        Properties: {
          ApiId: { Ref: "SawsApiGateway" },
          IntegrationType: "AWS_PROXY",
          IntegrationUri: {
            "Fn::Join": [
              "",
              [
                "arn:",
                {
                  Ref: "AWS::Partition",
                },
                ":apigateway:",
                {
                  Ref: "AWS::Region",
                },
                ":lambda:path/2015-03-31/functions/",
                {
                  "Fn::GetAtt": ["SawsApiLambda", "Arn"],
                },
                "/invocations",
              ],
            ],
          },
          IntegrationMethod: "POST",
          PayloadFormatVersion: "2.0",
        },
      },
      SawsApiRoute: {
        Type: "AWS::ApiGatewayV2::Route",
        Properties: {
          ApiId: { Ref: "SawsApiGateway" },
          RouteKey: "ANY /{proxy+}",
          Target: {
            "Fn::Join": [
              "/",
              [
                "integrations",
                {
                  Ref: "SawsApiLambdaIntegration",
                },
              ],
            ],
          },
        },
      },
      SawsApiGatewayStage: {
        Type: "AWS::ApiGatewayV2::Stage",
        Properties: {
          ApiId: { Ref: "SawsApiGateway" },
          StageName: stage,
          AutoDeploy: true,
        },
      },
      SawsApiGatewayLambdaPermission: {
        Type: "AWS::Lambda::Permission",
        Properties: {
          Action: "lambda:InvokeFunction",
          FunctionName: {
            Ref: "SawsApiLambda",
          },
          Principal: "apigateway.amazonaws.com",
          SourceArn: {
            "Fn::Sub":
              "arn:aws:execute-api:${AWS::Region}:${AWS::AccountId}:${SawsApiGateway}/*/$default",
          },
        },
      },
      SawsApiLambdaRole: {
        Type: "AWS::IAM::Role",
        Properties: {
          RoleName: `SawsApi${uppercase(name)}${uppercase(stage)}LambdaRole`,
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
              PolicyName: `AWSLambda${uppercase(name)}${uppercase(
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
                  {
                    Effect: "Allow",
                    Action: ["ses:SendEmail"],
                    Resource: "*",
                  },
                  ...permissions,
                ],
              },
            },
          ],
        },
      },
      SawsApiLambda: {
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
            "Fn::GetAtt": ["SawsApiLambdaRole", "Arn"],
          },
          Code: {
            S3Bucket: codeBucketName,
            S3Key: codeS3Key,
          },
          MemorySize: 1024,
          Timeout: 30,
        },
      },
      SawsApiGatewayInvokePermissions: {
        Type: "AWS::Lambda::Permission",
        Properties: {
          FunctionName: { Ref: "SawsApiLambda" },
          Action: "lambda:InvokeFunction",
          Principal: "apigateway.amazonaws.com",
          SourceArn: {
            "Fn::Join": [
              "",
              [
                "arn:aws:execute-api:",
                { Ref: "AWS::Region" },
                ":",
                { Ref: "AWS::AccountId" },
                ":",
                { Ref: "SawsApiGateway" },
                "/*/*/*",
              ],
            ],
          },
        },
      },
    },
    Outputs: {
      graphqlEndpoint: {
        Description: "ApiGateway Url",
        Value: {
          "Fn::Sub": `https://\${SawsApiGateway}.execute-api.\${AWS::Region}.amazonaws.com/${stage}/`,
        },
      },
    },
  };

  if (userPoolId != null && userPoolClientId != null) {
    config.Resources.SawsApiAuthorizer = {
      Type: "AWS::ApiGatewayV2::Authorizer",
      Properties: {
        ApiId: { Ref: "SawsApiGateway" },
        AuthorizerType: "JWT",
        IdentitySource: ["$request.header.Authorization"],
        Name: `${projectName}-${stage}-api-authorizer`,
        JwtConfiguration: {
          Audience: [userPoolClientId],
          Issuer: {
            "Fn::Sub": `https://cognito-idp.\${AWS::Region}.amazonaws.com/${userPoolId}`,
          },
        }
      },
    };

    config.Resources.SawsApiRoute.Properties.AuthorizationType = "JWT";
    config.Resources.SawsApiRoute.Properties.AuthorizerId = { Ref: "SawsApiAuthorizer" };
  }

  return JSON.stringify(config);
};

export const getStackName = (stage: string, name: string) => {
  const projectName = getProjectName();
  return `${projectName}-${stage}-${name}`;
};

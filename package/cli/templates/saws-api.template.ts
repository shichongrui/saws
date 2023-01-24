import { getProjectName } from "../../utils/get-project-name";
import { uppercase } from "../../utils/uppercase";

type SawsApiTemplateProperties = {
  moduleName: string;
  projectName: string;
  codeBucketName: string;
  codeS3Key: string;
  dbName: string;
  dbUsername: string;
  stage: string;
  resourcesStackName: string;
  functionNames: string[];
};

export default ({
  moduleName,
  projectName,
  codeBucketName,
  codeS3Key,
  dbName,
  dbUsername,
  stage,
  resourcesStackName,
  functionNames,
}: SawsApiTemplateProperties) =>
  JSON.stringify({
    AWSTemplateFormatVersion: "2010-09-09",
    Description:
      "AWS Cloudformation for resources required by the SAWS framework",
    Resources: {
      SawsApiGateway: {
        Type: "AWS::ApiGatewayV2::Api",
        Properties: {
          ProtocolType: "HTTP",
          Name: `${projectName}-${stage}-${moduleName}`,
          CorsConfiguration: {
            AllowMethods: ["*"],
            AllowOrigins: ["*"],
            AllowHeaders: ["*"],
          },
        },
      },
      SawsApiAuthorizer: {
        Type: "AWS::ApiGatewayV2::Authorizer",
        Properties: {
          ApiId: { Ref: "SawsApiGateway" },
          AuthorizerType: "JWT",
          IdentitySource: ["$request.header.Authorization"],
          Name: `${projectName}-${stage}-api-authorizer`,
          JwtConfiguration: {
            Audience: [
              { "Fn::ImportValue": `${resourcesStackName}-userPoolClientId` },
            ],
            Issuer: {
              "Fn::Sub": [
                "https://cognito-idp.${AWS::Region}.amazonaws.com/${userPoolId}",
                {
                  userPoolId: {
                    "Fn::ImportValue": `${resourcesStackName}-userPoolId`,
                  },
                },
              ],
            },
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
          AuthorizationType: "JWT",
          AuthorizerId: { Ref: "SawsApiAuthorizer" },
          RouteKey: "POST /",
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
          RoleName: `SawsApi${uppercase(stage)}LambdaRole`,
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
              PolicyName: `AWSLambda${uppercase(stage)}BasicExecutionRole`,
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
                  ...functionNames.map((name) => ({
                    Effect: "Allow",
                    Action: ["lambda:InvokeFunction"],
                    Resource: { "Fn::Sub": `arn:aws:lambda:\${AWS::Region}:\${AWS::AccountId}:function:${projectName}-${stage}-${name}` },
                  })),
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
              DATABASE_USERNAME: dbUsername,
              DATABASE_HOST: {
                "Fn::ImportValue": `${resourcesStackName}-postgresHost`,
              },
              DATABASE_PORT: {
                "Fn::ImportValue": `${resourcesStackName}-postgresPort`,
              },
              DATABASE_NAME: dbName,
              STAGE: stage,
              PROJECT_NAME: projectName,
            },
          },
          FunctionName: `${projectName}-${stage}-api`,
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
          "Fn::Sub":
            `https://\${SawsApiGateway}.execute-api.\${AWS::Region}.amazonaws.com/${stage}/`,
        },
      },
    },
  });

export const getStackName = (stage: string) => {
  const projectName = getProjectName();
  return `${projectName}-${stage}-saws-api`;
};

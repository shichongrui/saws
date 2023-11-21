import { AWSPermission } from "../../utils/aws-permission";
import { uppercase } from "../../utils/uppercase";

type RemixTemplateParameters = {
  stage: string;
  name: string;
  environment: Record<string, string>;
  moduleName: string;
  permissions: AWSPermission[];
  codeBucketName: string;
  codeS3Key: string;
};

export const getTemplate = ({
  stage,
  name,
  environment,
  moduleName,
  codeBucketName,
  codeS3Key,
  permissions,
}: RemixTemplateParameters) => {
  const uppercasedName = name.split("-").map(uppercase).join("");

  return JSON.stringify({
    AWSTemplateFormatVersion: "2010-09-09",
    Description: "AWS Cloudformation for Saws Remix",
    Resources: {
      [`Saws${uppercasedName}ResourcesBucket`]: {
        Type: "AWS::S3::Bucket",
        Properties: {
          BucketName: `${name}-resources-${stage}`,
          AccessControl: "Private",
        },
      },
      [`Saws${uppercasedName}ResourcesBucketOAC`]: {
        Type: "AWS::CloudFront::OriginAccessControl",
        Properties: {
          OriginAccessControlConfig: {
            Description:
              "origin access control(OAC) for allowing cloudfront to access S3 bucket",
            Name: "static-hosting-OAC",
            OriginAccessControlOriginType: "s3",
            SigningBehavior: "always",
            SigningProtocol: "sigv4",
          },
        },
      },
      [`Saws${uppercasedName}ResourcesBucketPolicy`]: {
        Type: "AWS::S3::BucketPolicy",
        Properties: {
          Bucket: {
            Ref: `Saws${uppercasedName}ResourcesBucket`
          },
          PolicyDocument: {
            Statement: [
              {
                Action: ["s3:GetObject"],
                Effect: "Allow",
                Resource: {
                  "Fn::Join": [
                    "",
                    [
                      { "Fn::GetAtt": [`Saws${uppercasedName}ResourcesBucket`, "Arn"]},
                      "/*"
                    ]
                  ]
                },
                Principal: {
                  Service: "cloudfront.amazonaws.com",
                },
                Condition: {
                  StringEquals: {
                    "AWS:SourceArn": {
                      "Fn::Join": [
                        "",
                        [
                          "arn:aws:cloudfront::",
                          { Ref: "AWS::AccountId" },
                          ":distribution/",
                          { "Fn::GetAtt": [`Saws${uppercasedName}Cloudfront`, "Id"]}
                        ]
                      ]
                    }
                  },
                },
              },
              {
                Effect: "Deny",
                Principal: "*",
                Action: "s3:*",
                Resource: [
                  {
                    "Fn::Sub": `\${Saws${uppercasedName}ResourcesBucket.Arn}/*`,
                  },
                  {
                    "Fn::GetAtt": [`Saws${uppercasedName}ResourcesBucket`, 'Arn'],
                  },
                ],
                Condition: {
                  Bool: {
                    "aws:SecureTransport": false,
                  },
                },
              },
            ],
          },
        },
      },
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
          Runtime: "nodejs18.x",
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
      [`Saws${uppercasedName}LambdaUrl`]: {
        Type: "AWS::Lambda::Url",
        Properties: {
          AuthType: "NONE",
          TargetFunctionArn: { Ref: `Saws${uppercasedName}Lambda` },
        },
      },
      [`Saws${uppercasedName}LambdaUrlInvokePolicy`]: {
        Type: "AWS::Lambda::Permission",
        Properties: {
          Action: "lambda:invokeFunctionUrl",
          FunctionName: { Ref: `Saws${uppercasedName}Lambda` },
          Principal: "*",
          FunctionUrlAuthType: "NONE",
        },
      },
      [`Saws${uppercasedName}Cloudfront`]: {
        Type: "AWS::CloudFront::Distribution",
        Properties: {
          DistributionConfig: {
            Origins: [
              {
                DomainName: {
                  "Fn::GetAtt": [
                    `Saws${uppercasedName}ResourcesBucket`,
                    "DomainName",
                  ],
                },
                Id: "S3Origin",
                S3OriginConfig: {
                  OriginAccessIdentity: "",
                },
                OriginAccessControlId: {
                  "Fn::GetAtt": [
                    `Saws${uppercasedName}ResourcesBucketOAC`,
                    "Id",
                  ],
                },
              },
              {
                DomainName: {
                  "Fn::Select": [
                    0,
                    {
                      "Fn::Split": [
                        "/",
                        {
                          "Fn::Select": [
                            1,
                            {
                              "Fn::Split": [
                                "://",
                                {
                                  "Fn::GetAtt": [
                                    `Saws${uppercasedName}LambdaUrl`,
                                    "FunctionUrl",
                                  ],
                                },
                              ],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
                Id: "LambdaOrigin",
                CustomOriginConfig: {
                  HTTPPort: "80",
                  HTTPSPort: "443",
                  OriginProtocolPolicy: "https-only",
                },
              },
            ],
            Enabled: true,
            HttpVersion: "http2",
            CacheBehaviors: [
              {
                AllowedMethods: ["GET", "HEAD"],
                CachedMethods: ["GET", "HEAD"],
                Compress: false,
                TargetOriginId: "S3Origin",
                PathPattern: "public/*",
                ViewerProtocolPolicy: "redirect-to-https",
                ForwardedValues: {
                  QueryString: false,
                  Cookies: {
                    Forward: "none",
                  },
                },
              },
            ],
            DefaultCacheBehavior: {
              AllowedMethods: ["GET", "HEAD", "OPTIONS", "PUT", "PATCH", "POST", "DELETE"],
              Compress: false,
              TargetOriginId: "LambdaOrigin",
              ViewerProtocolPolicy: "redirect-to-https",
              CachePolicyId: "4135ea2d-6df8-44a3-9df3-4b5a84be39ad",
              OriginRequestPolicyId: "b689b0a8-53d0-40ab-baf2-68738e2966ac",
            },
            PriceClass: "PriceClass_All",
          },
        },
      },
    },
    Outputs: {
      cloudfrontUrl: {
        Value: {
          "Fn::GetAtt": [`Saws${uppercasedName}Cloudfront`, "DomainName"],
        },
      },
      distributionId: {
        Description: "Cloudfront distribution id",
        Value: { Ref: `Saws${uppercasedName}Cloudfront` }
      }
    },
  });
};

export const getStackName = (stage: string, name: string) => {
  return `${stage}-${name}-remix`;
};

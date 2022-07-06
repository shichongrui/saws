import { uppercase } from "../src/utils/uppercase";

type SawsApiTemplateProperties = {
  moduleName: string;
  projectName: string;
  codeBucketName: string;
  codeS3Key: string;
  dbName: string;
  dbUsername: string;
  dbPasswordParameterName: string;
  vpcId: string;
  stage: string;
};

export const sawsApiTemplate = ({
  moduleName,
  projectName,
  codeBucketName,
  codeS3Key,
  dbName,
  dbUsername,
  dbPasswordParameterName,
  vpcId,
  stage,
}: SawsApiTemplateProperties) => /* json */ `{
    "AWSTemplateFormatVersion": "2010-09-09",
    "Description": "AWS Cloudformation for resources required by the SAWS framework",
    "Resources": {
        "SawsApiGateway": {
            "Type": "AWS::ApiGatewayV2::Api",
            "Properties": {
                "ProtocolType": "HTTP",
                "Name": "${projectName}-${stage}-saws-api",
                "CorsConfiguration": {
                    "AllowMethods": ["*"],
                    "AllowOrigins": ["*"],
                    "AllowHeaders": ["*"]
                }
            }
        },
        "SawsApiAuthorizer": {
            "Type": "AWS::ApiGatewayV2::Authorizer",
            "Properties": {
                "ApiId": { "Ref": "SawsApiGateway" },
                "AuthorizerType": "JWT",
                "IdentitySource": ["$request.header.Authorization"],
                "Name": "${projectName}-${stage}-api-authorizer",
                "JwtConfiguration": {
                    "Audience": [{ "Ref": "SawsUserPoolClient" }],
                    "Issuer": { "Fn::Sub": "https://cognito-idp.\${AWS::Region}.amazonaws.com/\${SawsUserPool}" }
                }
            }
        },
        "SawsApiLambdaIntegration": {
            "Type": "AWS::ApiGatewayV2::Integration",
            "Properties": {
                "ApiId": { "Ref": "SawsApiGateway" },
                "IntegrationType": "AWS_PROXY",
                "IntegrationUri": {
                    "Fn::Join": [
                        "",
                        [
                            "arn:",
                            {
                                "Ref": "AWS::Partition"
                            },
                            ":apigateway:",
                            {
                                "Ref": "AWS::Region"
                            },
                            ":lambda:path/2015-03-31/functions/",
                            {
                                "Fn::GetAtt": [
                                    "SawsApiLambda",
                                    "Arn"
                                ]
                            },
                            "/invocations"
                        ]
                    ]
                },
                "IntegrationMethod": "POST",
                "PayloadFormatVersion": "2.0"
            }
        },
        "SawsApiRoute": {
            "Type": "AWS::ApiGatewayV2::Route",
            "Properties": {
                "ApiId": { "Ref": "SawsApiGateway" },
                "AuthorizationType": "JWT",
                "AuthorizerId": { "Ref": "SawsApiAuthorizer" },
                "RouteKey": "POST /",
                "Target": {
                    "Fn::Join": [
                        "/",
                        [
                            "integrations",
                            {
                                "Ref": "SawsApiLambdaIntegration"
                            }
                        ]
                    ]
                }
            }
        },
        "SawsApiGatewayStage": {
            "Type": "AWS::ApiGatewayV2::Stage",
            "Properties": {
                "ApiId": { "Ref": "SawsApiGateway" },
                "StageName": "${stage}",
                "AutoDeploy": true
            }
        },
        "SawsApiGatewayLambdaPermission": {
            "Type": "AWS::Lambda::Permission",
            "Properties": {
                "Action": "lambda:InvokeFunction",
                "FunctionName": {
                    "Ref": "SawsApiLambda"
                },
                "Principal": "apigateway.amazonaws.com",
                "SourceArn": {
                    "Fn::Sub": "arn:aws:execute-api:\${AWS::Region}:\${AWS::AccountId}:\${SawsApiGateway}/*/$default"
                }
            }
        },
        "SawsApiLambdaRole": {
            "Type": "AWS::IAM::Role",
            "Properties": {
                "RoleName": "SawsApi${uppercase(stage)}LambdaRole",
                "AssumeRolePolicyDocument": {
                    "Version": "2012-10-17",
                    "Statement": [{
                        "Effect": "Allow",
                        "Principal": {
                            "Service": [ "lambda.amazonaws.com" ]
                        },
                        "Action": [ "sts:AssumeRole" ]
                    }]
                },
                "Path": "/",
                "Policies": [{
                    "PolicyName": "AWSLambda${uppercase(
                      stage
                    )}BasicExecutionRole",
                    "PolicyDocument": {
                        "Version": "2012-10-17",
                        "Statement": [{
                            "Effect": "Allow",
                            "Action": [
                                "logs:CreateLogGroup",
                                "logs:CreateLogStream",
                                "logs:PutLogEvents"
                            ],
                            "Resource": "*"
                        }, {
                            "Effect": "Allow",
                            "Action": [
                                "ssm:GetParameter",
                                "ssm:GetParameters"
                            ],
                            "Resource": { "Fn::Sub": "arn:aws:ssm:\${AWS::Region}:\${AWS::AccountId}:parameter/${stage}/*" }
                        }]
                    }
                }]
            }
        },
        "SawsApiLambda": {
            "Type": "AWS::Lambda::Function",
            "DependsOn": ["SawsPostgresInstance"],
            "Properties": {
                "Environment": {
                    "Variables": {
                        "NODE_ENV": "prod",
                        "DATABASE_USERNAME": "${dbUsername}",
                        "DATABASE_HOST": {
                            "Fn::GetAtt": ["SawsPostgresInstance", "Endpoint.Address"]
                        },
                        "DATABASE_PORT": {
                            "Fn::GetAtt": ["SawsPostgresInstance", "Endpoint.Port"]
                        },
                        "DATABASE_NAME": "${dbName}",
                        "STAGE": "${stage}"
                    }
                },
                "FunctionName": "${projectName}-${stage}-api",
                "Handler": "${moduleName}.handler",
                "Runtime": "nodejs16.x",
                "PackageType": "Zip",
                "Role": {
                    "Fn::GetAtt": [
                        "SawsApiLambdaRole",
                        "Arn"
                    ]
                },
                "Code": {
                    "S3Bucket": "${codeBucketName}",
                    "S3Key": "${codeS3Key}"
                },
                "Timeout": 30
            }
        },
        "SawsApiGatewayInvokePermissions": {
            "Type": "AWS::Lambda::Permission",
            "Properties": {
                "FunctionName": { "Ref": "SawsApiLambda" },
                "Action": "lambda:InvokeFunction",
                "Principal": "apigateway.amazonaws.com",
                "SourceArn": { 
                    "Fn::Join": [
                        "", 
                        [
                            "arn:aws:execute-api:",
                            { "Ref": "AWS::Region" }, ":",
                            { "Ref": "AWS::AccountId" }, ":",
                            { "Ref": "SawsApiGateway" },
                            "/*/*/*"
                        ]
                    ]
                }
            }
        },
        "SawsPostgresSecurityGroup": {
            "Type": "AWS::EC2::SecurityGroup",
            "Properties": {
                "GroupName": "Saws${uppercase(stage)}DBSecurityGroup",
                "GroupDescription": "Security group for the SAWS Postgres instance",
                "SecurityGroupIngress": [{
                    "CidrIp": "0.0.0.0/0",
                    "FromPort": "5432",
                    "ToPort": "5432",
                    "IpProtocol": "tcp"
                }],
                "SecurityGroupEgress": [{
                    "CidrIp": "0.0.0.0/0",
                    "FromPort": "-1",
                    "ToPort": "-1",
                    "IpProtocol": "-1"
                }],
                "VpcId": "${vpcId}"
            }
        },
        "SawsPostgresInstance": {
            "Type": "AWS::RDS::DBInstance",
            "Properties": {
                "AllocatedStorage": "20",
                "DBInstanceClass": "db.t3.micro",
                "DBName": "${dbName}",
                "Engine": "postgres",
                "MasterUsername": "${dbUsername}",
                "MasterUserPassword": "{{resolve:ssm-secure:/${stage}/${dbPasswordParameterName}:1}}",
                "PubliclyAccessible": true,
                "StorageEncrypted": true,
                "StorageType": "gp2",
                "VPCSecurityGroups": [{ "Ref": "SawsPostgresSecurityGroup" }]
            }
        },
        "SawsUserPool": {
            "Type": "AWS::Cognito::UserPool",
            "Properties": {
                "UserPoolName": "${projectName}-${stage}-users",
                "UsernameAttributes": ["email"],
                "AutoVerifiedAttributes": ["email"],
            }
        },
        "SawsUserPoolClient": {
            "Type": "AWS::Cognito::UserPoolClient",
            "Properties": {
                "ClientName": "${projectName}-${stage}-users-client",
                "UserPoolId": { "Ref": "SawsUserPool" },
                "ExplicitAuthFlows": [
                    "ALLOW_ADMIN_USER_PASSWORD_AUTH",
                    "ALLOW_USER_SRP_AUTH",
                    "ALLOW_REFRESH_TOKEN_AUTH"
                ],
                "GenerateSecret": false,
            }
        }
    },
    "Outputs": {
        "graphqlEndpoint": {
            "Description": "ApiGateway Url",
            "Value": {
                "Fn::Sub": "https://\${SawsApiGateway}.execute-api.\${AWS::Region}.amazonaws.com/${stage}/"
            }
        },
        "postgresHost": {
            "Description": "Connection URL for the DB",
            "Value": {
                "Fn::GetAtt": ["SawsPostgresInstance", "Endpoint.Address"]
            }
        },
        "postgresPort": {
            "Description": "Connection port for the DB",
            "Value": {
                "Fn::GetAtt": ["SawsPostgresInstance", "Endpoint.Port"]
            }
        },
        "userPoolId": {
            "Description": "Cognito user pool id",
            "Value": {
                "Ref": "SawsUserPool"
            }
        },
        "userPoolName": {
            "Description": "Cognito user pool name",
            "Value": "${projectName}-${stage}-users"
        },
        "userPoolClientId": {
            "Description": "Cognito user pool client id",
            "Value": {
                "Ref": "SawsUserPoolClient"
            }
        },
        "userPoolClientName": {
            "Description": "Cognito user pool client name",
            "Value": "${projectName}-${stage}-users-client"
        }
    }
}`;

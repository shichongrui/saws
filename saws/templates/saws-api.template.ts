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
                },
                "Target": { "Fn::GetAtt": ["SawsApiLambda", "Arn"] }
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
                "VPCSecurityGroups": [{ "Ref": "SawsPostgresSecurityGroup" }]
            }
        }
    },
    "Outputs": {
        "graphqlEndpoint": {
            "Description": "ApiGateway Url",
            "Value": {
                "Fn::Sub": "https://\${SawsApiGateway}.execute-api.\${AWS::Region}.amazonaws.com/"
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
        }
    }
}`;

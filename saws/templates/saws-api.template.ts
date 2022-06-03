type SawsApiTemplateProperties = {
  functionName: string;
  moduleName: string;
  codeBucketName: string;
  codeS3Key: string;
  dbName: string;
  dbUsername: string;
  dbPassword: string;
  vpcId: string;
};

export const sawsApiTemplate = ({
  functionName,
  moduleName,
  codeBucketName,
  codeS3Key,
  dbName,
  dbUsername,
  dbPassword,
  vpcId,
}: SawsApiTemplateProperties) => /* json */ `{
    "AWSTemplateFormatVersion": "2010-09-09",
    "Description": "AWS Cloudformation for resources required by the SAWS framework",
    "Resources": {
        "SawsApiGateway": {
            "Type": "AWS::ApiGatewayV2::Api",
            "Properties": {
                "ProtocolType": "HTTP",
                "Name": "${moduleName}-saws-api",
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
                "RoleName": "SawsApiLambdaRole",
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
                    "PolicyName": "AWSLambdaBasicExecutionRole",
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
                        "DATABASE_URL": {
                            "Fn::Sub": [
                                "postgres://${dbUsername}:${dbPassword}@\${dbEndpoint}:\${dbPort}/${dbName}",
                                {
                                    "dbEndpoint": {
                                        "Fn::GetAtt": ["SawsPostgresInstance", "Endpoint.Address"]
                                    },
                                    "dbPort": {
                                        "Fn::GetAtt": ["SawsPostgresInstance", "Endpoint.Port"]
                                    }
                                }
                            ]
                        }
                    }
                },
                "FunctionName": "${functionName}",
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
                "GroupName": "SawsDBSecurityGroup",
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
                "MasterUserPassword": "${dbPassword}",
                "PubliclyAccessible": true,
                "StorageEncrypted": true,
                "VPCSecurityGroups": [{ "Ref": "SawsPostgresSecurityGroup" }]
            }
        }
    },
    "Outputs": {
        "SawsApiEndpoint": {
            "Description": "ApiGateway Url",
            "Value": {
                "Fn::Sub": "https://\${SawsApiGateway}.execute-api.us-east-1.amazonaws.com/"
            }
        },
        "SawsDBEndpoint": {
            "Description": "Connection URL for the DB",
            "Value": {
                "Fn::GetAtt": ["SawsPostgresInstance", "Endpoint.Address"]
            }
        },
        "SawsDBPort": {
            "Description": "Connection port for the DB",
            "Value": {
                "Fn::GetAtt": ["SawsPostgresInstance", "Endpoint.Port"]
            }
        }
    }
}`;

/*                 
"IntegrationResponses": [{
                        "StatusCode": 200,
                        "ResponseParameters": {
                            "method.response.header.Access-Control-Allow-Headers": "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
                            "method.response.header.Access-Control-Allow-Methods": "'POST,OPTIONS'",
                            "method.response.header.Access-Control-Allow-Origin": "'*'"
                        },
                        "ResponseTemplates": {
                            "application/json": ""
                        }
                    }]
"MethodResponses": [{
                    "StatusCode": 200,
                    "ResponseModels": {
                        "application/json": "Empty"
                    },
                    "ResponseParameters": {
                        "method.response.header.Access-Control-Allow-Headers": false,
                        "method.response.header.Access-Control-Allow-Methods": false,
                        "method.response.header.Access-Control-Allow-Origin": false              
                    }
                }],
                */

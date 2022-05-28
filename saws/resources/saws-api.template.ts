type SawsApiTemplateProperties = {
  functionName: string;
  moduleName: string;
  codeBucketName: string;
  codeS3Key: string;
};

export const sawsApiTemplate = ({
  functionName,
  moduleName,
  codeBucketName,
  codeS3Key,
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
            "Properties": {
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
                }
            }
        }
    },
    "Outputs": {
        "SawsApiEndpoint": {
            "Description": "ApiGateway Url",
            "Value": {
                "Fn::Sub": "https://\${SawsApiGateway}.execute-api.us-east-1.amazonaws.com/"
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

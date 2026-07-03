type AuthTemplateParameters = {
  stage: string;
  name: string;
};

export const getTemplate = ({
  name,
  stage,
}: AuthTemplateParameters) => JSON.stringify({
  "AWSTemplateFormatVersion": "2010-09-09",
  "Description": "AWS Cloudformation for resources required by SAWS Auth",
  "Resources": {
    SawsUserPool: {
      Type: "AWS::Cognito::UserPool",
      Properties: {
        UserPoolName: `${stage}-${name}-user-pool`,
        UsernameAttributes: ["email"],
        AutoVerifiedAttributes: ["email"],
      }
    },
    SawsUserPoolClient: {
      Type: "AWS::Cognito::UserPoolClient",
      Properties: {
        ClientName: `${stage}-${name}-user-pool-client`,
        UserPoolId: { "Ref": "SawsUserPool" },
        ExplicitAuthFlows: [
          "ALLOW_ADMIN_USER_PASSWORD_AUTH",
          "ALLOW_USER_SRP_AUTH",
          "ALLOW_REFRESH_TOKEN_AUTH",
          "ALLOW_USER_PASSWORD_AUTH"
        ],
        GenerateSecret: false,
      }
    }
  },
  Outputs: {
    userPoolId: {
      Description: "Cognito user pool id",
      Value: {
        Ref: "SawsUserPool"
      },
      Export: {
        Name: { "Fn::Sub": "\${AWS::StackName}-userPoolId" }
      }
    },
    userPoolName: {
      Description: "Cognito user pool name",
      Value: `${stage}-${name}-user-pool`
    },
    userPoolClientId: {
      Description: "Cognito user pool client id",
      Value: {
        Ref: "SawsUserPoolClient"
      },
      Export: {
        Name: { "Fn::Sub": "\${AWS::StackName}-userPoolClientId" }
      }
    },
    userPoolClientName: {
      Description: "Cognito user pool client name",
      Value: `${stage}-${name}-user-pool-client`
    },
    userPoolJwksUri: {
      Description: 'JWKs uri to use for token verification',
      Value: { "Fn::Sub": "https://cognito-idp.\${AWS::Region}.amazonaws.com/\${SawsUserPool}/.well-known/jwks.json"}
    }
  }
});

export const getStackName = (stage: string, name: string) => {
  return `${stage}-${name}-auth`;
};

import { getProjectName } from "../../../utils/get-project-name";

type AuthTemplateParameters = {
  projectName: string;
  stage: string;
};

export const getTemplate = ({
  projectName,
  stage,
}: AuthTemplateParameters) => JSON.stringify({
  "AWSTemplateFormatVersion": "2010-09-09",
  "Description": "AWS Cloudformation for resources required by SAWS Auth",
  "Resources": {
    SawsUserPool: {
      Type: "AWS::Cognito::UserPool",
      Properties: {
        UserPoolName: `${projectName}-${stage}-users`,
        UsernameAttributes: ["email"],
        AutoVerifiedAttributes: ["email"],
      }
    },
    SawsUserPoolClient: {
      Type: "AWS::Cognito::UserPoolClient",
      Properties: {
        ClientName: `${projectName}-${stage}-users-client`,
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
      Value: `${projectName}-${stage}-users`
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
      Value: `${projectName}-${stage}-users-client`
    }
  }
});

export const getStackName = (stage: string) => {
  const projectName = getProjectName();
  return `${projectName}-${stage}-auth`;
};

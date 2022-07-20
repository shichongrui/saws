import { getProjectName } from "../../utils/get-project-name";
import { uppercase } from "../../utils/uppercase";

type SawsResourcesTemplateParameters = {
  bucketName: string;
  projectName: string;
  stage: string;
  vpcId: string;
  dbName: string;
  dbUsername: string;
  dbPasswordParameterName: string;
  containerFunctionNames: string[];
};

const buildFunctionRepositories = (containerFunctionNames: string[], stage: string) => {
  if (containerFunctionNames.length === 0) return '';

  return containerFunctionNames.reduce((acc: Record<string, unknown>, name) => {
    acc[`Saws${name.split('-').map(uppercase).join('')}Repository`] = {
      Type: "AWS::ECR::Repository",
      Properties: {
        RepositoryName: `${name}-${stage}`,
      }
    }

    return acc;
  }, {});
}

export default ({
  projectName,
  bucketName,
  stage,
  dbName,
  dbUsername,
  dbPasswordParameterName,
  vpcId,
  containerFunctionNames,
}: SawsResourcesTemplateParameters) => JSON.stringify({
  "AWSTemplateFormatVersion": "2010-09-09",
  "Description": "AWS Cloudformation for resources required by the SAWS framework",
  "Resources": {
    ...buildFunctionRepositories(containerFunctionNames, stage),
    SawsS3Bucket: {
      Type: "AWS::S3::Bucket",
      Properties: {
        BucketName: bucketName,
      }
    },
    SawsPostgresSecurityGroup: {
      Type: "AWS::EC2::SecurityGroup",
      Properties: {
        GroupName: `Saws${uppercase(stage)}DBSecurityGroup`,
        GroupDescription: "Security group for the SAWS Postgres instance",
        SecurityGroupIngress: [{
          CidrIp: "0.0.0.0/0",
          FromPort: "5432",
          ToPort: "5432",
          IpProtocol: "tcp"
        }],
        SecurityGroupEgress: [{
          CidrIp: "0.0.0.0/0",
          FromPort: "-1",
          ToPort: "-1",
          IpProtocol: "-1"
        }],
        VpcId: vpcId
      }
    },
    SawsPostgresInstance: {
      Type: "AWS::RDS::DBInstance",
      Properties: {
        AllocatedStorage: "20",
        DBInstanceClass: "db.t3.micro",
        DBName: dbName,
        Engine: "postgres",
        MasterUsername: dbUsername,
        MasterUserPassword: `{{resolve:ssm-secure:/${stage}/${dbPasswordParameterName}:1}}`,
        PubliclyAccessible: true,
        StorageEncrypted: true,
        StorageType: "gp2",
        VPCSecurityGroups: [{ "Ref": "SawsPostgresSecurityGroup" }]
      }
    },
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
          "ALLOW_REFRESH_TOKEN_AUTH"
        ],
        GenerateSecret: false,
      }
    }
  },
  Outputs: {
    postgresHost: {
      Description: "Connection URL for the DB",
      Value: {
        "Fn::GetAtt": ["SawsPostgresInstance", "Endpoint.Address"]
      },
      Export: {
        Name: { "Fn::Sub": "\${AWS::StackName}-postgresHost" }
      }
    },
    postgresPort: {
      Description: "Connection port for the DB",
      Value: {
        "Fn::GetAtt": ["SawsPostgresInstance", "Endpoint.Port"]
      },
      Export: {
        Name: { "Fn::Sub": "\${AWS::StackName}-postgresPort" }
      }
    },
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
  return `${projectName}-${stage}-saws-resources`;
};

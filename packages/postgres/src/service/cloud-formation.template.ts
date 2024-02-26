import { uppercase } from "@shichongrui/saws-utils/uppercase";

type PostgresTemplateParameters = {
  stage: string;
  vpcId: string;
  dbName: string;
  dbUsername: string;
  dbPasswordParameterName: string;
};

export const getTemplate = ({
  stage,
  dbName,
  dbUsername,
  dbPasswordParameterName,
  vpcId,
}: PostgresTemplateParameters) => JSON.stringify({
  "AWSTemplateFormatVersion": "2010-09-09",
  "Description": "AWS Cloudformation for Saws Postgres",
  "Resources": {
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
  }
});

export const getStackName = (stage: string, name: string) => {
  return `${stage}-${name}-postgres`;
};

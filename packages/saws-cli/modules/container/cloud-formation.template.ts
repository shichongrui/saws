import { getProjectName } from "@shichongrui/saws-core";

type ContainerTemplateProperties = {
  stage: string;
  projectName: string;
  name: string;
  repositoryName: string;
  environment: Record<string, string>;
  vpcId: string;
  subnets: string[];
  healthCheckUrl?: string;
};

export const getTemplate = ({
  stage,
  projectName,
  name,
  repositoryName,
  environment,
  vpcId,
  subnets,
  healthCheckUrl,
}: ContainerTemplateProperties) => {
  return JSON.stringify({
    // JSON cloudformation template for an ECS cluster, service, and task definition that runs on EC2. Security group should
    // allow access from the internet on port 80 and 443
    AWSTemplateFormatVersion: "2010-09-09",
    Description: `AWS Cloudformation for ${name} container`,
    Resources: {
      Cluster: {
        Type: "AWS::ECS::Cluster",
        Properties: {
          ClusterName: `${projectName}-${stage}-${name}-cluster`,
        },
      },
      CloudWatchLogsGroup: {
        Type: "AWS::Logs::LogGroup",
        Properties: {
          LogGroupName: `/${projectName}/${stage}/${name}`,
          RetentionInDays: 30,
        }
      },
      TaskDefinition: {
        Type: "AWS::ECS::TaskDefinition",
        Properties: {
          Family: `${projectName}-${stage}-${name}-cluster`,
          RequiresCompatibilities: ["EC2"],
          Memory: 900,
          NetworkMode: "host",
          ContainerDefinitions: [
            {
              Name: name,
              Image: {
                "Fn::Sub": `\${AWS::AccountId}.dkr.ecr.\${AWS::Region}.amazonaws.com/${repositoryName}:latest`,
              },
              Environment: Object.entries(environment).map(([key, value]) => ({
                Name: key,
                Value: value,
              })),
              MemoryReservation: 400,
              PortMappings: [
                {
                  ContainerPort: environment.PORT,
                  HostPort: environment.PORT,
                },
              ],
              HealthCheck: healthCheckUrl != null ?{
                "Command": ["CMD", "curl", "-f", healthCheckUrl],
              } : undefined,
              LogConfiguration: {
                LogDriver: 'awslogs',
                Options: {
                  'awslogs-group': { Ref: 'CloudWatchLogsGroup' },
                  'awslogs-region': { Ref: 'AWS::Region' },
                  'awslogs-stream-prefix': 'ecs',
                }
              }
            },
          ],
        },
      },
      Service: {
        Type: "AWS::ECS::Service",
        DependsOn: ["Ec2Instance"],
        Properties: {
          Cluster: {
            Ref: "Cluster",
          },
          TaskDefinition: {
            Ref: "TaskDefinition",
          },
          DeploymentConfiguration: {
            MinimumHealthyPercent: 0,
          },
          DesiredCount: 1,
          LaunchType: "EC2",
        },
      },
      SecurityGroup: {
        Type: "AWS::EC2::SecurityGroup",
        Properties: {
          GroupName: `${projectName}-${stage}-${name}-security-group`,
          GroupDescription: "Allow HTTP",
          SecurityGroupIngress: [
            {
              IpProtocol: "tcp",
              FromPort: environment.PORT,
              ToPort: environment.PORT,
              CidrIp: "0.0.0.0/0",
            },
          ],
          VpcId: vpcId,
        },
      },
      Ec2Instance: {
        Type: "AWS::EC2::Instance",
        Properties: {
          ImageId: "ami-0fe5f366c083f59ca",
          InstanceType: "t2.micro",
          IamInstanceProfile: {
            Ref: "InstanceProfile",
          },
          SecurityGroupIds: [
            {
              Ref: "SecurityGroup",
            },
          ],
          SubnetId: subnets[0],
          UserData: {
            "Fn::Base64": {
              "Fn::Join": [
                "",
                [
                  "#!/bin/bash -xe\n",
                  "echo ECS_CLUSTER=",
                  {
                    Ref: "Cluster",
                  },
                  " >> /etc/ecs/ecs.config\n",
                ],
              ],
            },
          },
        },
      },
      InstanceRole: {
        Type: "AWS::IAM::Role",
        Properties: {
          Path: "/",
          ManagedPolicyArns: [
            "arn:aws:iam::aws:policy/service-role/AmazonEC2ContainerServiceforEC2Role",
            "arn:aws:iam::aws:policy/service-role/AmazonEC2RoleforSSM",
          ],
          AssumeRolePolicyDocument: {
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Action: ["sts:AssumeRole"],
                Principal: {
                  Service: "ec2.amazonaws.com",
                },
              },
            ],
          },
          Policies: [
            {
              PolicyName: "logs",
              PolicyDocument: {
                Version: "2012-10-17",
                Statement: [
                  {
                    Effect: "Allow",
                    Action: ["logs:*"],
                    Resource: [
                      {
                        "Fn::Sub":
                          "arn:aws:logs:${AWS::Region}:${AWS::AccountId}:log-group:*",
                      },
                    ],
                  },
                  {
                    Effect: "Allow",
                    Action: ["ecs:*"],
                    Resource: "*",
                  },
                ],
              },
            },
          ],
        },
      },
      InstanceProfile: {
        Type: "AWS::IAM::InstanceProfile",
        Properties: {
          Path: "/",
          Roles: [
            {
              Ref: "InstanceRole",
            },
          ],
        },
      },
    },
    Outputs: {
      url: {
        Value: {
          "Fn::Join": [
            "",
            [
              "http://",
              {
                "Fn::GetAtt": ["Ec2Instance", "PublicDnsName"],
              },
              `:${environment.PORT}`,
            ],
          ],
        },
      },
    },
  });
};

export const getStackName = (stage: string, name: string) => {
  const projectName = getProjectName();
  return `${projectName}-${stage}-${name}`;
};

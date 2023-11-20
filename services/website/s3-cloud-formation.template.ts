import { getProjectName } from "../../utils/get-project-name";
import { uppercase } from "../../utils/uppercase";

type S3TemplateParameters = {
  name: string;
  stage: string;
  domain?: string;
};

export const getTemplate = ({
  name,
  stage,
  domain,
}: S3TemplateParameters) => {
  return JSON.stringify({
    AWSTemplateFormatVersion: "2010-09-09",
    Description: "AWS Cloudformation for Saws Website S3",
    Resources: {
      WebsiteS3Bucket: {
        Type: "AWS::S3::Bucket",
        Properties: {
          BucketName: domain,
          AccessControl: "PublicRead",
          WebsiteConfiguration: {
            IndexDocument: "index.html"
          },
        },
      },
      WebsiteBucketPolicy: {
        Type: "AWS::S3::BucketPolicy",
        Properties: {
          PolicyDocument: {
            Id: `${uppercase(name)}${uppercase(stage)}WebsitePolicy`,
            Version: "2012-10-17",
            Statement: [
              {
                Sid: "PublicReadForGetBucketObjects",
                Effect: "Allow",
                Principal: "*",
                Action: "s3:GetObject",
                Resource: {
                  "Fn::Join": [
                    "",
                    [
                      "arn:aws:s3:::",
                      {
                        Ref: "WebsiteS3Bucket",
                      },
                      "/*",
                    ],
                  ],
                },
              },
            ],
          },
          Bucket: {
            Ref: "WebsiteS3Bucket",
          },
        },
      },
    },
    Outputs: {
      websiteS3Url: {
        Value: {
          "Fn::GetAtt": ["WebsiteS3Bucket", "WebsiteURL"],
        },
      },
    },
  });
};

export const getStackName = (stage: string, name: string) => {
  const projectName = getProjectName();
  return `${projectName}-${stage}-${name}-s3`;
};

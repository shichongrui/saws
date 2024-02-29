import { uppercase } from "@shichongrui/saws-utils/uppercase";

type TemplateParameters = {
  bucketName: string;
  name: string;
};

export const getTemplate = ({ name, bucketName }: TemplateParameters) => {
  const uppercasedName = name.split("-").map(uppercase).join("");

  return JSON.stringify({
    AWSTemplateFormatVersion: "2010-09-09",
    Description: "AWS Cloudformation for Saws File Storage S3 Bucket",
    Resources: {
      [`Saws${uppercasedName}Bucket`]: {
        Type: "AWS::S3::Bucket",
        Properties: {
          BucketName: bucketName,
          CorsConfiguration: {
            CorsRules: [
              {
                AllowedHeaders: ["*"],
                AllowedMethods: ["GET", "PUT", "POST"],
                AllowedOrigins: ["*"],
                ExposedHeaders: [],
              },
            ],
          },
        },
      },
    },
  });
};

export const getStackName = (stage: string, name: string) => {
  return `${stage}-${name}-s3`;
};

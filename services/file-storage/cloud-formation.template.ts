import { uppercase } from "../../utils/uppercase";

type TemplateParameters = {
  bucketName: string;
  name: string;
};

export const getTemplate = ({ name, bucketName }: TemplateParameters) => {
  const uppercasedName = name.split("-").map(uppercase).join("");

  return JSON.stringify({
    AWSTemplateFormatVersion: "2010-09-09",
    Description: "AWS Cloudformation for Saws Remix File Storage S3 Bucket",
    Resources: {
      [`Saws${uppercasedName}Bucket`]: {
        Type: "AWS::S3::Bucket",
        Properties: {
          BucketName: bucketName
        }
      }
    },
    Outputs: {
      codeS3Bucket: {
        Value: {
          "Ref": `Saws${uppercasedName}Bucket`
        }
      }
    },
  });
};

export const getStackName = (stage: string, name: string) => {
  return `${stage}-${name}-s3`;
};

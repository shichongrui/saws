import { uppercase } from "../../utils/uppercase";

type CodeS3TemplateParameters = {
  bucketName: string;
  name: string;
};

export const getTemplate = ({ name, bucketName }: CodeS3TemplateParameters) => {
  const uppercasedName = name.split("-").map(uppercase).join("");

  return JSON.stringify({
    AWSTemplateFormatVersion: "2010-09-09",
    Description: "AWS Cloudformation for Saws Remix Code S3 Bucket",
    Resources: {
      [`Saws${uppercasedName}CodeBucket`]: {
        Type: "AWS::S3::Bucket",
        Properties: {
          BucketName: bucketName
        }
      }
    },
    Outputs: {
      codeS3Bucket: {
        Value: {
          "Ref": `Saws${uppercasedName}CodeBucket`
        }
      }
    },
  });
};

export const getStackName = (stage: string, name: string) => {
  return `${stage}-${name}-code`;
};

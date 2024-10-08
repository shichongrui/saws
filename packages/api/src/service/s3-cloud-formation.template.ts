type S3TemplateParameters = {
  bucketName: string;
};

export const getTemplate = ({
  bucketName,
}: S3TemplateParameters) =>
  JSON.stringify({
    AWSTemplateFormatVersion: "2010-09-09",
    Description: "AWS Cloudformation for functions in the SAWS framework",
    Resources: {
      SawsS3Bucket: {
        Type: "AWS::S3::Bucket",
        Properties: {
          BucketName: bucketName,
        }
      },
    }
  });

export const getStackName = (stage: string, name: string) => {
  return `${stage}-${name}-s3`;
};
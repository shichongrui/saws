type SawsResourcesTemplateParameters = {
  bucketName: string
};

export default ({
  bucketName,
}: SawsResourcesTemplateParameters) => /* json */`{
  "AWSTemplateFormatVersion": "2010-09-09",
  "Description": "AWS Cloudformation for resources required by the SAWS framework",
  "Resources": {
    "SawsS3Bucket": {
      "Type": "AWS::S3::Bucket",
      "Properties": {
        "BucketName": "${bucketName}"
      }
    }
  }
}`;

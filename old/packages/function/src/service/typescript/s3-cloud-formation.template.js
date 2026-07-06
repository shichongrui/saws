"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStackName = exports.getTemplate = void 0;
const getTemplate = ({ bucketName, }) => JSON.stringify({
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
exports.getTemplate = getTemplate;
const getStackName = (stage, name) => {
    return `${stage}-${name}-s3`;
};
exports.getStackName = getStackName;

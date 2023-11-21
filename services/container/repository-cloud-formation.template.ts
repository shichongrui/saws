import { uppercase } from "../../utils/uppercase";

type ContainerRepositoryTemplateParameters = {
  name: string;
  stage: string;
};

export const getTemplate = ({
  name,
  stage,
}: ContainerRepositoryTemplateParameters) =>
  JSON.stringify({
    AWSTemplateFormatVersion: "2010-09-09",
    Description: `AWS Cloudformation for ${name} container repository`,
    Resources: {
      [`Saws${name.split("-").map(uppercase).join("")}Repository`]: {
        Type: "AWS::ECR::Repository",
        Properties: {
          RepositoryName: `${name}-${stage}`,
        },
      },
    }
  });

export const getStackName = (stage: string, name: string) => {
  return `${stage}-${name}-repository`;
};
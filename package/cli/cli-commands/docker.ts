import { exec } from "child_process";
import { dockerCommand } from "docker-cli-js";

export const buildImage = async (name: string, dir: string) => {
  console.log("Building", name);
  await dockerCommand(`build -t ${name} .`, {
    currentWorkingDirectory: dir,
    echo: false,
  });
};

export const tagImage = async (name: string, awsAccountId: string, repository: string, tag: string) => {
  await dockerCommand(`tag ${name} ${awsAccountId}.dkr.ecr.us-east-1.amazonaws.com/${repository}:${tag}`, { echo: false });
}

export const pushImage = async (awsAccountId: string, repository: string, tag: string) => {
  console.log("Pushing", repository);
  await dockerCommand(`push ${awsAccountId}.dkr.ecr.us-east-1.amazonaws.com/${repository}:${tag}`, { echo: false });
};

export const loginToAWSDocker = async (awsAccountId: string) => {
  return new Promise((resolve, reject) => {
    exec(`aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin ${awsAccountId}.dkr.ecr.us-east-1.amazonaws.com`, (err) => {
      if (err) {
        return reject(err);
      }

      resolve(null);
    });
  });
};

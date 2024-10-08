import { exec, spawn } from "child_process";
import { dockerCommand } from "docker-cli-js";
import { retryUntil } from "./retry-until";
import { onProcessExit } from "./on-exit";

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

export const isContainerRunning = async (name: string) => {
  try {
    await dockerCommand(`container inspect -f '{{.State.Running}}' ${name}`, { echo: false });
    return true
  } catch (err) {
    return false;
  }
}

export const waitForContainerToBeStopped = async (name: string) => {
  // the cognito docker container can take some time to spin down
  // so if you rapidaly kill the process and then start it again
  // you can get into a scenario where we can't start the container
  // because it's still running. So we will first check to make sure
  // it is not running any longer
  await retryUntil(async () => {
    try {
      await dockerCommand(`container inspect -f '{{.State.Running}}' ${name}`, { echo: false });
      return false
    } catch (err) {
      return true;
    }
  }, 500);
}

type StartContainerParameters = {
  name: string,
  image: string,
  additionalArguments: string[],
  command?: string[],
  check: () => Promise<boolean>
}
export const startContainer = async ({
  name,
  image,
  additionalArguments,
  command = [],
  check
}: StartContainerParameters) => {
  await waitForContainerToBeStopped(name)

  onProcessExit(() => {
    dockerCommand(`stop ${name}`, { echo: false });
  });

  const childProcess = spawn("docker", [
    "run",
    "--rm",
    "--name",
    name,
    ...additionalArguments,
    image,
    ...command
  ]);

  await retryUntil(check, 500);

  return childProcess
}

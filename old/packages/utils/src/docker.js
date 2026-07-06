"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startContainer = exports.waitForContainerToBeStopped = exports.isContainerRunning = exports.loginToAWSDocker = exports.pushImage = exports.tagImage = exports.buildImage = void 0;
const child_process_1 = require("child_process");
const docker_cli_js_1 = require("docker-cli-js");
const retry_until_1 = require("./retry-until");
const on_exit_1 = require("./on-exit");
const buildImage = async (name, dir) => {
    console.log("Building", name);
    await (0, docker_cli_js_1.dockerCommand)(`build -t ${name} .`, {
        currentWorkingDirectory: dir,
        echo: false,
    });
};
exports.buildImage = buildImage;
const tagImage = async (name, awsAccountId, repository, tag) => {
    await (0, docker_cli_js_1.dockerCommand)(`tag ${name} ${awsAccountId}.dkr.ecr.us-east-1.amazonaws.com/${repository}:${tag}`, { echo: false });
};
exports.tagImage = tagImage;
const pushImage = async (awsAccountId, repository, tag) => {
    console.log("Pushing", repository);
    await (0, docker_cli_js_1.dockerCommand)(`push ${awsAccountId}.dkr.ecr.us-east-1.amazonaws.com/${repository}:${tag}`, { echo: false });
};
exports.pushImage = pushImage;
const loginToAWSDocker = async (awsAccountId) => {
    return new Promise((resolve, reject) => {
        (0, child_process_1.exec)(`aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin ${awsAccountId}.dkr.ecr.us-east-1.amazonaws.com`, (err) => {
            if (err) {
                return reject(err);
            }
            resolve(null);
        });
    });
};
exports.loginToAWSDocker = loginToAWSDocker;
const isContainerRunning = async (name) => {
    try {
        await (0, docker_cli_js_1.dockerCommand)(`container inspect -f '{{.State.Running}}' ${name}`, { echo: false });
        return true;
    }
    catch (err) {
        return false;
    }
};
exports.isContainerRunning = isContainerRunning;
const waitForContainerToBeStopped = async (name) => {
    // the cognito docker container can take some time to spin down
    // so if you rapidaly kill the process and then start it again
    // you can get into a scenario where we can't start the container
    // because it's still running. So we will first check to make sure
    // it is not running any longer
    await (0, retry_until_1.retryUntil)(async () => {
        try {
            await (0, docker_cli_js_1.dockerCommand)(`container inspect -f '{{.State.Running}}' ${name}`, { echo: false });
            return false;
        }
        catch (err) {
            return true;
        }
    }, 500);
};
exports.waitForContainerToBeStopped = waitForContainerToBeStopped;
const startContainer = async ({ name, image, additionalArguments, command = [], check }) => {
    await (0, exports.waitForContainerToBeStopped)(name);
    (0, on_exit_1.onProcessExit)(() => {
        (0, docker_cli_js_1.dockerCommand)(`stop ${name}`, { echo: false });
    });
    const childProcess = (0, child_process_1.spawn)("docker", [
        "run",
        "--rm",
        "--name",
        name,
        ...additionalArguments,
        image,
        ...command
    ]);
    await (0, retry_until_1.retryUntil)(check, 500);
    return childProcess;
};
exports.startContainer = startContainer;

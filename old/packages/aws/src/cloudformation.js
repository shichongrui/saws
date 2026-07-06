"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CloudFormation = void 0;
const client_cloudformation_1 = require("@aws-sdk/client-cloudformation");
const retryUntil = async (callback, timeout) => {
    while (true) {
        const done = await callback();
        if (done)
            break;
        await new Promise((r) => setTimeout(r, timeout));
    }
    return;
};
class CloudFormation {
    client;
    constructor() {
        this.client = new client_cloudformation_1.CloudFormationClient({});
    }
    async describeStack(stackName) {
        const command = new client_cloudformation_1.DescribeStacksCommand({
            StackName: stackName,
        });
        const results = await this.client.send(command);
        return results;
    }
    async checkStackStatus(stackName) {
        let results = null;
        await retryUntil(async () => {
            results = await this.describeStack(stackName);
            const stacks = [
                client_cloudformation_1.StackStatus.CREATE_COMPLETE,
                client_cloudformation_1.StackStatus.CREATE_FAILED,
                client_cloudformation_1.StackStatus.UPDATE_COMPLETE,
                client_cloudformation_1.StackStatus.UPDATE_FAILED,
                client_cloudformation_1.StackStatus.IMPORT_COMPLETE,
                client_cloudformation_1.StackStatus.IMPORT_ROLLBACK_COMPLETE,
                client_cloudformation_1.StackStatus.IMPORT_ROLLBACK_FAILED,
                client_cloudformation_1.StackStatus.ROLLBACK_COMPLETE,
                client_cloudformation_1.StackStatus.ROLLBACK_FAILED,
                client_cloudformation_1.StackStatus.UPDATE_ROLLBACK_COMPLETE,
                client_cloudformation_1.StackStatus.UPDATE_ROLLBACK_FAILED,
                client_cloudformation_1.StackStatus.DELETE_COMPLETE,
                client_cloudformation_1.StackStatus.DELETE_FAILED,
            ];
            return stacks.includes(results.Stacks?.[0].StackStatus);
        }, 2000);
        let action = "";
        switch (results.Stacks?.[0].StackStatus) {
            case client_cloudformation_1.StackStatus.CREATE_COMPLETE:
                action = "create";
                break;
            case client_cloudformation_1.StackStatus.UPDATE_COMPLETE:
                action = "update";
                break;
            case client_cloudformation_1.StackStatus.IMPORT_COMPLETE:
                action = "import";
                break;
            case client_cloudformation_1.StackStatus.DELETE_COMPLETE:
                action = "delete";
                break;
            case client_cloudformation_1.StackStatus.ROLLBACK_COMPLETE:
            case client_cloudformation_1.StackStatus.UPDATE_ROLLBACK_COMPLETE:
            case client_cloudformation_1.StackStatus.IMPORT_ROLLBACK_COMPLETE:
            case client_cloudformation_1.StackStatus.CREATE_FAILED:
            case client_cloudformation_1.StackStatus.UPDATE_FAILED:
            case client_cloudformation_1.StackStatus.IMPORT_ROLLBACK_FAILED:
            case client_cloudformation_1.StackStatus.ROLLBACK_FAILED:
            case client_cloudformation_1.StackStatus.UPDATE_ROLLBACK_FAILED:
            case client_cloudformation_1.StackStatus.DELETE_FAILED:
                console.log("Stack action failed");
                return results;
        }
        console.log(`Stack ${action} succeeded.`);
        return results;
    }
    async createStack(stackName, templateBody) {
        console.log("Creating stack");
        const command = new client_cloudformation_1.CreateStackCommand({
            StackName: stackName,
            TemplateBody: templateBody,
            Capabilities: [client_cloudformation_1.Capability.CAPABILITY_NAMED_IAM, client_cloudformation_1.Capability.CAPABILITY_AUTO_EXPAND],
        });
        await this.client.send(command);
        const results = await this.checkStackStatus(stackName);
        return results;
    }
    ;
    async updateStack(stackName, templateBody) {
        console.log("Updating stack");
        const command = new client_cloudformation_1.UpdateStackCommand({
            StackName: stackName,
            TemplateBody: templateBody,
            Capabilities: [client_cloudformation_1.Capability.CAPABILITY_NAMED_IAM, client_cloudformation_1.Capability.CAPABILITY_AUTO_EXPAND],
        });
        await this.client.send(command);
        const results = await this.checkStackStatus(stackName);
        return results;
    }
    async deployStack(stackName, templateBody) {
        try {
            await this.describeStack(stackName);
            const results = await this.updateStack(stackName, templateBody);
            return results;
        }
        catch (err) {
            // stack does not exist create it
            if (err.Code === "ValidationError" &&
                err.message.includes("does not exist")) {
                const results = await this.createStack(stackName, templateBody);
                return results;
            }
            if (err.Code === "ValidationError" &&
                err.message === "No updates are to be performed.")
                return this.describeStack(stackName);
            throw err;
        }
    }
    ;
}
exports.CloudFormation = CloudFormation;

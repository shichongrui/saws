import {
  CloudFormationClient,
  DescribeStacksCommand,
  CreateStackCommand,
  StackStatus,
  UpdateStackCommand,
  Capability,
  DescribeStacksCommandOutput,
  DeleteStackCommand,
} from "@aws-sdk/client-cloudformation";
import retryUntil from "../retry-until";

export class CloudFormation {
  client: CloudFormationClient

  constructor() {
    this.client = new CloudFormationClient({});
  }

  async describeStack(stackName: string) {
    const command = new DescribeStacksCommand({
      StackName: stackName,
    });
    const results = await this.client.send(command);
    return results;
  }

  async checkStackStatus(stackName: string) {
    let results: DescribeStacksCommandOutput | null = null;
    await retryUntil(async () => {
      results = await this.describeStack(stackName);
      return [
        StackStatus.CREATE_COMPLETE,
        StackStatus.CREATE_FAILED,
        StackStatus.UPDATE_COMPLETE,
        StackStatus.UPDATE_FAILED,
        StackStatus.IMPORT_COMPLETE,
        StackStatus.IMPORT_ROLLBACK_COMPLETE,
        StackStatus.IMPORT_ROLLBACK_FAILED,
        StackStatus.ROLLBACK_COMPLETE,
        StackStatus.ROLLBACK_FAILED,
        StackStatus.UPDATE_ROLLBACK_COMPLETE,
        StackStatus.UPDATE_ROLLBACK_FAILED,
        StackStatus.DELETE_COMPLETE,
        StackStatus.DELETE_FAILED,
      ].includes(results.Stacks?.[0].StackStatus as StackStatus);
    }, 2000);
  
    let action = "";
    switch (results!.Stacks?.[0].StackStatus) {
      case StackStatus.CREATE_COMPLETE:
        action = "create";
        break;
      case StackStatus.UPDATE_COMPLETE:
        action = "update";
        break;
      case StackStatus.IMPORT_COMPLETE:
        action = "import";
        break;
      case StackStatus.DELETE_COMPLETE:
        action = "delete";
        break;
  
      case StackStatus.ROLLBACK_COMPLETE:
      case StackStatus.UPDATE_ROLLBACK_COMPLETE:
      case StackStatus.IMPORT_ROLLBACK_COMPLETE:
      case StackStatus.CREATE_FAILED:
      case StackStatus.UPDATE_FAILED:
      case StackStatus.IMPORT_ROLLBACK_FAILED:
      case StackStatus.ROLLBACK_FAILED:
      case StackStatus.UPDATE_ROLLBACK_FAILED:
      case StackStatus.DELETE_FAILED:
        console.log("Stack action failed");
        return results;
    }
  
    console.log(`Stack ${action} succeeded.`);
  
    return results;
  }
  
  async createStack(
    stackName: string,
    templateBody: string
  ): Promise<DescribeStacksCommandOutput | null> {
    console.log("Creating stack");
    const command = new CreateStackCommand({
      StackName: stackName,
      TemplateBody: templateBody,
      Capabilities: [Capability.CAPABILITY_NAMED_IAM],
    });
    await this.client.send(command);
  
    const results = await this.checkStackStatus(stackName);
    return results;
  };
  
  async updateStack(
    stackName: string,
    templateBody: string
  ): Promise<DescribeStacksCommandOutput | null> {
    console.log("Updating stack");
    const command = new UpdateStackCommand({
      StackName: stackName,
      TemplateBody: templateBody,
      Capabilities: [Capability.CAPABILITY_NAMED_IAM],
    });
    await this.client.send(command);
  
    const results = await this.checkStackStatus(stackName);
    return results;
  }
  
  async deployStack(
    stackName: string,
    templateBody: string
  ): Promise<DescribeStacksCommandOutput | null> {
    try {
      await this.describeStack(stackName);
      const results = await this.updateStack(stackName, templateBody);
      return results;
    } catch (err: any) {
      // stack does not exist create it
      if (
        err.Code === "ValidationError" &&
        err.message.includes("does not exist")
      ) {
        const results = await this.createStack(stackName, templateBody);
        return results;
      }
      if (
        err.Code === "ValidationError" &&
        err.message === "No updates are to be performed."
      )
        return this.describeStack(stackName);
      throw err;
    }
  };
}

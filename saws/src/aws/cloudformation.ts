import { CloudFormationClient, DescribeStacksCommand, CreateStackCommand, StackStatus, UpdateStackCommand, Capability, DescribeStacksCommandOutput } from "@aws-sdk/client-cloudformation";
import { retryUntil } from "../utils/retry-until";

const client = new CloudFormationClient({
    region: 'us-east-1',
});

export const describeStack = async (stackName: string) => {
    const command = new DescribeStacksCommand({
        StackName: stackName,
    });
    const results = await client.send(command);
    return results;
}

export const createStack = async (stackName: string, templateBody: string): Promise<DescribeStacksCommandOutput | null> => {
    console.log('Creating stack');
    const command = new CreateStackCommand({
        StackName: stackName,
        TemplateBody: templateBody,
        Capabilities: [Capability.CAPABILITY_NAMED_IAM],
    });
    await client.send(command);

    let results: DescribeStacksCommandOutput | null = null;
    await retryUntil(async () => {
        console.log("Check stack status");
        results = await describeStack(stackName);
        return results.Stacks?.[0].StackStatus === StackStatus.CREATE_COMPLETE;
    }, 2000);
    
    return results;
}

export const updateStack = async (stackName: string, templateBody: string): Promise<DescribeStacksCommandOutput | null> => {
    console.log('Updating stack');
    const command = new UpdateStackCommand({
        StackName: stackName,
        TemplateBody: templateBody,
        Capabilities: [Capability.CAPABILITY_NAMED_IAM],
    });
    await client.send(command);

    let results: DescribeStacksCommandOutput | null = null;
    await retryUntil(async () => {
        console.log("Checking stack status");
        results = await describeStack(stackName);
        return results.Stacks?.[0].StackStatus === StackStatus.UPDATE_COMPLETE;
    }, 2000);

    return results;
}

export const deployStack = async (stackName: string, templateBody: string): Promise<DescribeStacksCommandOutput | null> => {
    try {
        await describeStack(stackName);
        const results = await updateStack(stackName, templateBody);
        return results;
    } catch (err: any) {
        // stack does not exist create it
        if (err.Code === 'ValidationError' && err.message.includes("does not exist")) {
            const results = await createStack(stackName, templateBody);
            return results;
        }
        if (err.Code === 'ValidationError' && err.message === 'No updates are to be performed.') return null;
        throw err;
    }
}
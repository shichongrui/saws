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

export const checkStackStatus = async (stackName: string) => {
    let results: DescribeStacksCommandOutput | null = null;
    await retryUntil(async () => {
        results = await describeStack(stackName);
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
        ].includes(results.Stacks?.[0].StackStatus as StackStatus);
    }, 2000);

    let action = '';
    switch (results!.Stacks?.[0].StackStatus) {
        case StackStatus.CREATE_COMPLETE:
            action = 'create';
            break;
        case StackStatus.UPDATE_COMPLETE:
            action = 'update';
            break;
        case StackStatus.IMPORT_COMPLETE:
            action = 'import';
            break;
            
        case StackStatus.ROLLBACK_COMPLETE:
        case StackStatus.UPDATE_ROLLBACK_COMPLETE:
        case StackStatus.IMPORT_ROLLBACK_COMPLETE:
        case StackStatus.CREATE_FAILED:
        case StackStatus.UPDATE_FAILED:
        case StackStatus.IMPORT_ROLLBACK_FAILED:
        case StackStatus.ROLLBACK_FAILED:
        case StackStatus.UPDATE_ROLLBACK_FAILED:
            console.log('Stack action failed')
            return results;
    }

    console.log(`Stack ${action} succeeded.`);

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

    const results = await checkStackStatus(stackName);
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

    const results = await checkStackStatus(stackName);
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
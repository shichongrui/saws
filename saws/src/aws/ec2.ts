import { EC2Client, DescribeVpcsCommand, Filter } from '@aws-sdk/client-ec2';

const client = new EC2Client({
    region: 'us-east-1',
});

export const getDefaultVPCId = async () => {
    const command = new DescribeVpcsCommand({
        Filters: [{
            Name: 'is-default',
            Values: ['true']
        }],
    })
    const results = await client.send(command);
    return results.Vpcs?.[0].VpcId ?? ''
}
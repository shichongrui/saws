import { EC2Client, DescribeVpcsCommand, DescribeSubnetsCommand } from "@aws-sdk/client-ec2";

export class EC2 {
  client: EC2Client;
  
  constructor() {
    this.client = new EC2Client({});
  }

  async getDefaultVPCId() {
    const command = new DescribeVpcsCommand({
      Filters: [
        {
          Name: "is-default",
          Values: ["true"],
        },
      ],
    });
    const results = await this.client.send(command);
    return results.Vpcs?.[0].VpcId ?? "";
  };

  async getDefaultVPC() {
    const command = new DescribeVpcsCommand({
      Filters: [
        {
          Name: "is-default",
          Values: ["true"],
        },
      ],
    });
    const results = await this.client.send(command);
    return results.Vpcs?.[0] ?? {};
  }

  async getSubnetsForVPC(vpcId: string) {
    const command = new DescribeSubnetsCommand({
      Filters: [
        {
          Name: "vpc-id",
          Values: [vpcId],
        },
      ],
    })
    const results = await this.client.send(command);
    return results.Subnets ?? [];
  }
}

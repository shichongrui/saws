"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EC2 = void 0;
const client_ec2_1 = require("@aws-sdk/client-ec2");
class EC2 {
    client;
    constructor() {
        this.client = new client_ec2_1.EC2Client({});
    }
    async getDefaultVPCId() {
        const command = new client_ec2_1.DescribeVpcsCommand({
            Filters: [
                {
                    Name: "is-default",
                    Values: ["true"],
                },
            ],
        });
        const results = await this.client.send(command);
        return results.Vpcs?.[0].VpcId ?? "";
    }
    ;
    async getDefaultVPC() {
        const command = new client_ec2_1.DescribeVpcsCommand({
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
    async getSubnetsForVPC(vpcId) {
        const command = new client_ec2_1.DescribeSubnetsCommand({
            Filters: [
                {
                    Name: "vpc-id",
                    Values: [vpcId],
                },
            ],
        });
        const results = await this.client.send(command);
        return results.Subnets ?? [];
    }
}
exports.EC2 = EC2;

import { STS } from "@shichongrui/saws-aws";

export const getAwsAccountId = async () => {
  const sts = new STS();
  const { Account: accountId } = await sts.getCallerIdentity();
  return accountId;
};

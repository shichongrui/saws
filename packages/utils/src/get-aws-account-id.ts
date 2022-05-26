import { STS } from "@saws/aws/sts";

export const getAwsAccountId = async () => {
  const sts = new STS();
  const { Account: accountId } = await sts.getCallerIdentity();
  return accountId;
};

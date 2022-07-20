import { STS } from '../aws/sts';

const getAwsAccountId = async () => {
  const sts = new STS();
  const { Account: accountId } = await sts.getCallerIdentity();
  return accountId;
}

export default getAwsAccountId;
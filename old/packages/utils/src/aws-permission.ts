export type AWSPermission = {
  Effect: 'Allow' | 'Deny';
  Action: string[];
  Resource: string
} | {
  Effect: 'Allow' | 'Deny';
  Action: string[];
  Resource: { [k: string]: any }
}
export const sawsTsTemplate = ({ name }: { name: string }) =>
  `import { ServiceDefinition } from "@saws/core";

export default new ServiceDefinition({
  name: "${name}",
  dependencies: [],
});
`;

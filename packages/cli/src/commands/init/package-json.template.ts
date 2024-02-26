export const packageJsonTemplate = ({
  name
}: {
  name: string
}) => `
{
  "name": "${name}",
  "version": "1.0.0",
  "description": "",
  "scripts": {
    "dev": "saws dev"
  },
  "license": "ISC"
}`
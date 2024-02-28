export const envTemplate = ({
  dbName,
  password
}: {
  dbName: string
  password: string
}) => `# Used only by prisma for CLI commands
DATABASE_URL=postgres://postgres:${password}@localhost:5432/${dbName}`
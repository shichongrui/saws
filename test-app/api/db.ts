import { PrismaClient } from '@prisma/client';
import { RDS } from 'saws';

let db: PrismaClient | null = null;

export const getDBClient = async () => {
  if (db != null) {
    return db;
  }

  const dbUrl = await RDS.getDBUrl();

  db = new PrismaClient({
    datasources: {
      db: {
        url: dbUrl,
      }
    }
  });

  return db;
}
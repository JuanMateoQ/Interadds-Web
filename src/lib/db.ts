// Cliente Prisma único por proceso (también compartido entre Next y el servidor Node propio).
import './env';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

function createClient() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL no está definida. Copia .env.example a .env y configúrala.');
  }
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

const g = globalThis;
const prisma = g.__interaddsPrisma || (g.__interaddsPrisma = createClient());

export { prisma };

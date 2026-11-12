// Vacía todas las tablas de la aplicación (semillas y pruebas). Nunca se usa en producción.
import { prisma } from '../lib/db';
import { config } from '../lib/env';

async function truncateAll() {
  if (config.isProd) throw new Error('No se vacía la base en producción');
  const rows = await prisma.$queryRaw`SELECT tablename::text AS name FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE '\_prisma%'`;
  if (!rows.length) return;
  const names = rows.map((t) => `"${t.name}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE ${names} RESTART IDENTITY CASCADE`);
}

export { truncateAll };

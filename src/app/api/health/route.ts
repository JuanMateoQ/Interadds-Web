import { open, jsonResponse } from '@/lib/routeKit';
import { prisma } from '@/lib/db';

export const GET = open(async () => {
  await prisma.$queryRaw`SELECT 1`;
  return jsonResponse({ status: 'ok', time: new Date().toISOString() });
});
